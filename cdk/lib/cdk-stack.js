/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const { Construct } = require('constructs');
const { Stack, Duration } = require('aws-cdk-lib');

const lambda = require('aws-cdk-lib').aws_lambda;
const s3 = require('aws-cdk-lib').aws_s3;
const sfn = require('aws-cdk-lib').aws_stepfunctions;
const ec2 = require('aws-cdk-lib').aws_ec2;
const ecs = require('aws-cdk-lib').aws_ecs;
const iam = require('aws-cdk-lib').aws_iam;
const events = require('aws-cdk-lib').aws_events;
const targets = require('aws-cdk-lib').aws_events_targets;
const kms = require('aws-cdk-lib').aws_kms;
const dynamodb = require('aws-cdk-lib').aws_dynamodb;
const logs = require('aws-cdk-lib').aws_logs;

const ReviewUIConstruct = require('./review-ui-construct');
const EcsTaskConstruct = require('./ecs-task-construct');
const cdkNagConfig = require('./cdk-nag-configuration');

/**
 * The defines stack deployed by this AWS Sample.
 */
class CdkStack extends Stack {
    /**
     * Constructor for the CDK stack.
     * @param {Construct} scope Scope for the construct.
     * @param {string} id ID for the construct.
     * @param {StackProps} props Props for the construct.
     */
    constructor(scope, id, props) {
        super(scope, id, props);

        const LOG_LEVEL = this.node.tryGetContext('LOG_LEVEL')

        // Get the CMK
        const encryptionKey = kms.Key.fromKeyArn(this, 'cmk', this.node.tryGetContext('CMK_ARN'));

        // Create a new DDB table for holding progress info.
        const stagingTable = new dynamodb.Table(this, "table", {
            partitionKey: {
                name: "ExecutionId",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "Index",
                type: dynamodb.AttributeType.STRING,
            },
            encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryptionKey: encryptionKey,
            pointInTimeRecovery: true,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
        });

        // Create new bucket to store temporary data.
        const stagingBucket = new s3.Bucket(this, 'staging_bucket', {
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: encryptionKey,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            serverAccessLogsBucket: s3.Bucket.fromBucketArn(this, 'log-bucket', this.node.tryGetContext('ACCESS_LOG_BUCKET')),
            serverAccessLogsPrefix: this.node.tryGetContext('ACCESS_LOG_PREFIX'),
            enforceSSL: true,
            publicReadAccess: false
        });
        stagingBucket.addToResourcePolicy(
            new iam.PolicyStatement({
                resources: [
                    stagingBucket.arnForObjects("*"),
                    stagingBucket.bucketArn
                ],
                effect: iam.Effect.ALLOW,
                actions: ["s3:List*", "s3:Get*", "s3:Put*"],
                principals: [
                    new iam.ServicePrincipal('lambda.amazonaws.com'),
                    new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
                ]
            })
        );

        const reviewUIConstruct = new ReviewUIConstruct(this, 'review-ui-construct', {
            entityReviewUIName: this.node.tryGetContext('ENTITY_REVIEW_UI_NAME'),
            logLevel: LOG_LEVEL
        });

        // Get vpc
        const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
            vpcId: this.node.tryGetContext('VPC_ID')
        });

        // Get the subnets
        const subnets = this.node.tryGetContext('SUBNET_IDS').map(subnetId => ec2.Subnet.fromSubnetAttributes(this, subnetId, {
            subnetId: subnetId
        }));

        // Get the SecurityGroup for VPC entities.
        const vpcSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'securitygroup', this.node.tryGetContext('VPC_SECURITYGROUP_ID'));

        // Create ECS cluster inside the VPC.
        const cluster = new ecs.Cluster(this, "ecs_cluster", {
            vpc: vpc,
            containerInsights: true
        });

        // Prepare ECS task for human review.
        const humanReviewTaskRole = new iam.Role(this, 'human_review_task_role', {
            assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com')
        });
        stagingBucket.grantReadWrite(humanReviewTaskRole);

        const reviewPreparationConstruct = new EcsTaskConstruct(this, 'review-preparation-task-construct', {
            taskRole: humanReviewTaskRole,
            encryptionKey: encryptionKey,
            stagingTable: stagingTable,
            stagingBucket: stagingBucket,
            humanTaskUiArn: reviewUIConstruct.getHumanTaskUiArn(),
            cluster: cluster,
            subnets: subnets,
            securityGroups: [vpcSecurityGroup],
            path: '../containers',
            file: 'review-preparation.dockerfile',
            taskCpu: this.node.tryGetContext('TASK_CPU'),
            taskRam: this.node.tryGetContext('TASK_RAM'),
            containerRam: this.node.tryGetContext('CONTAINER_RAM'),
            logLevel: LOG_LEVEL
        })

        // Prepare ECS task for final data preparation.
        const dataPreparationConstruct = new EcsTaskConstruct(this, 'data-preparation-task-construct', {
            encryptionKey: encryptionKey,
            stagingTable: stagingTable,
            stagingBucket: stagingBucket,
            cluster: cluster,
            subnets: subnets,
            securityGroups: [vpcSecurityGroup],
            path: '../containers',
            file: 'data-preparation.dockerfile',
            taskCpu: this.node.tryGetContext('TASK_CPU'),
            taskRam: this.node.tryGetContext('TASK_RAM'),
            containerRam: this.node.tryGetContext('CONTAINER_RAM'),
            logLevel: LOG_LEVEL
        })

        // Create the statemachine and definition.
        const definition = reviewPreparationConstruct.getTask().next(dataPreparationConstruct.getTask());
        const stateMachine = new sfn.StateMachine(this, 'statemachine', {
            definition,
            tracingEnabled: true,
            logs: {
                destination: new logs.LogGroup(this, 'sfn-loggroup'),
                level: sfn.LogLevel.ALL,
            }
        });

        // Setup Lambda for continuing execution after review is over.
        const continueFunction = new lambda.Function(this, 'continue-function', {
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../lambdas/continue-function/'),
            timeout: Duration.seconds(60),
            environment: {
                TABLE_NAME: stagingTable.tableName,
                LOG_LEVEL: LOG_LEVEL
            },
            vpc: vpc,
            vpcSubnets: { subnets },
            securityGroups: [vpcSecurityGroup],
        });
        stagingBucket.grantRead(continueFunction);
        stagingTable.grantReadWriteData(continueFunction);
        continueFunction.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['states:SendTaskSuccess', 'states:SendTaskFailure', 'states:SendTaskHeartbeat'],
            resources: [`arn:${Stack.of(this).partition}:states:${Stack.of(this).region}:${Stack.of(this).account}:*`]
        }));
        continueFunction.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sagemaker:DeleteFlowDefinition'],
            resources: [`arn:${Stack.of(this).partition}:sagemaker:${Stack.of(this).region}:${Stack.of(this).account}:flow-definition/*`]
        }));

        // Setup Lambda trigger against A2I event for review completion.
        const continueRule = new events.Rule(this, 'continue-rule', {
            eventPattern: {
                "source": ["aws.sagemaker"],
                "detail-type": ["SageMaker A2I HumanLoop Status Change"]
            },
        });
        continueRule.addTarget(new targets.LambdaFunction(continueFunction));

        cdkNagConfig.configure(this);
    }
}

module.exports = { CdkStack }
