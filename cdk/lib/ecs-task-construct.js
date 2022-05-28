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
const { Stack } = require('aws-cdk-lib');

const ecs = require('aws-cdk-lib').aws_ecs;
const sfn = require('aws-cdk-lib').aws_stepfunctions;
const sfnTasks = require('aws-cdk-lib').aws_stepfunctions_tasks;
const iam = require('aws-cdk-lib').aws_iam;
const logs = require('aws-cdk-lib').aws_logs;

/**
 * Custom construct to manage the creation and deletion of the A2I human review UI.
 */
class EcsTaskConstruct extends Construct {
    /**
     * Constructor for the CDK construct.
     * @param {Construct} scope Scope for the construct.
     * @param {string} id ID for the construct.
     * @param {StackProps} props Props for the construct.
     */
    constructor(scope, id, props) {
        super(scope, id, props);

        // Create the task definition.
        const taskDefinition = new ecs.TaskDefinition(this, id + '_task_definition', {
            compatibility: ecs.Compatibility.FARGATE,
            cpu: props.taskCpu,
            memoryMiB: props.taskRam
        });

        // Add permissions to the role.
        this.addToPrincipalPolicy(taskDefinition.taskRole,
            [
                {
                    actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'],
                    resources: [`arn:${Stack.of(this).partition}:s3:::*`]
                },
                {
                    actions: ['sagemaker:CreateFlowDefinition', 'sagemaker:StartHumanLoop', 'sagemaker:DescribeFlowDefinition', 'sagemaker:DeleteFlowDefinition'],
                    resources: [`arn:${Stack.of(this).partition}:sagemaker:${Stack.of(this).region}:${Stack.of(this).account}:flow-definition/*`]
                },
                {
                    actions: ['states:SendTaskSuccess', 'states:SendTaskFailure', 'states:SendTaskHeartbeat'],
                    resources: [`arn:${Stack.of(this).partition}:states:${Stack.of(this).region}:${Stack.of(this).account}:*`]
                },
                {
                    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                    resources: [`arn:${Stack.of(this).partition}:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`]
                },
                {
                    actions: ['sns:Publish'],
                    resources: [`arn:${Stack.of(this).partition}:sns:${Stack.of(this).region}:${Stack.of(this).account}:*`]
                },
            ]
        );

        // Add taskRole if it is specified.
        if (props.taskRole) {
            this.addToPrincipalPolicy(taskDefinition.taskRole,
                [
                    {
                        actions: ['iam:PassRole'],
                        resources: [props.taskRole.roleArn]
                    }
                ]
            );
        }

        // Grant permissions on the table and the key.
        props.encryptionKey.grantEncryptDecrypt(taskDefinition.taskRole);
        props.stagingTable.grantReadWriteData(taskDefinition.taskRole);

        // Create container definition.
        const containerDefinition = taskDefinition.addContainer(id + '_container_definition', {
            image: ecs.ContainerImage.fromAsset(props.path, {
                file: props.file
            }),
            memoryLimitMiB: parseInt(props.containerRam),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: id,
                mode: ecs.AwsLogDriverMode.NON_BLOCKING,
                logRetention: logs.RetentionDays.ONE_YEAR
            })
        });

        // Create stepfunction task for ECS.
        this.task = new sfnTasks.EcsRunTask(this, id + '_task', {
            integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            containerOverrides: [{
                containerDefinition: containerDefinition,
                environment: [
                    {
                        name: 'EXECUTION_ID',
                        value: sfn.JsonPath.stringAt('$$.Execution.Id')
                    },
                    {
                        name: 'INPUT_MANIFEST',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.INPUT_MANIFEST')
                    },
                    {
                        name: 'LABEL_ATTRIBUTE_NAME',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.LABEL_ATTRIBUTE_NAME')
                    },
                    {
                        name: 'WORK_TEAM_ARN',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.WORK_TEAM_ARN')
                    },
                    {
                        name: 'SNS_TOPIC_ARN',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.SNS_TOPIC_ARN')
                    },
                    {
                        name: 'EXECUTION_NAME',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.EXECUTION_NAME')
                    },
                    {
                        name: 'OUTPUT_MANIFEST',
                        value: sfn.JsonPath.stringAt('$$.Execution.Input.OUTPUT_MANIFEST')
                    },
                    {
                        name: 'REVIEW_TASK_ROLE',
                        value: props.taskRole ? props.taskRole.roleArn : undefined
                    },
                    {
                        name: 'WORK_TEMPLATE_ARN',
                        value: props.humanTaskUiArn
                    },
                    {
                        name: 'STAGING_BUCKET_NAME',
                        value: props.stagingBucket.bucketName
                    },
                    {
                        name: 'STAGING_TABLE_NAME',
                        value: props.stagingTable.tableName
                    },
                    {
                        name: 'TASK_TOKEN',
                        value: sfn.JsonPath.taskToken
                    },
                    {
                        name: 'LOG_LEVEL',
                        value: props.logLevel
                    }
                ]
            }],
            cluster: props.cluster,
            taskDefinition: taskDefinition,
            launchTarget: new sfnTasks.EcsFargateLaunchTarget(),
            subnets: props.subnets,
            securityGroups: props.securityGroups,
        });
    }

    /**
     * Get the stepfunction task object for this ECS task.
     * @returns stepfunction task object.
     */
    getTask() {
        return this.task;
    }

    /**
     * Helper function to add a list of permissions to a role.
     * @param {*} role Role to which the permissions are to be added.
     * @param {*} data Array of permissions.
     */
    addToPrincipalPolicy(role, data) {
        data.forEach(item => {
            const statement = new iam.PolicyStatement({
                principal: new iam.AccountPrincipal(Stack.of(this).account),
                effect: iam.Effect.ALLOW,
                actions: item.actions,
                resources: item.resources
            });

            statement.addCondition("StringEquals", { "aws:RequestedRegion": Stack.of(this).region });

            role.addToPrincipalPolicy(statement);
        })
    }
}

module.exports = EcsTaskConstruct;