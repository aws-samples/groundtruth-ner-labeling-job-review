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

const { Aspects } = require('aws-cdk-lib');
const cdkNag = require('cdk-nag');

exports.configure = (stack) => {
    Aspects.of(stack).add(new cdkNag.AwsSolutionsChecks({ verbose: true }));

    const accountId = process.env.CDK_DEFAULT_ACCOUNT;

    const items = [
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Multiple human review loops needs to be managed.',
            appliesTo: [`Resource::arn:<AWS::Partition>:sagemaker:ap-south-1:${accountId}:flow-definition/*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Multiple human review loops needs to be managed.',
            appliesTo: [`Resource::arn:<AWS::Partition>:sagemaker:ap-south-1:${accountId}:flow-definition/*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/Resource',
            id: 'AwsSolutions-IAM4',
            reason: 'Multiple human review loops needs to be managed.',
            appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Task token APIs are not tied to a resource.',
            appliesTo: [`Resource::arn:<AWS::Partition>:states:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'These are needed to work with encrypted S3 staging bucket.',
            appliesTo: ['Action::kms:GenerateDataKey*', 'Action::kms:ReEncrypt*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Continue function needs to have full access on the staging bucket and runtime specified output bucket.',
            appliesTo: ['Resource::<stagingbucketC62ECAF7.Arn>/*', 'Action::s3:List*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/continue-function/ServiceRole/Resource',
            id: 'AwsSolutions-IAM4',
            reason: 'AWSLambdaVPCAccessExecutionRole is safe to use.',
            appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'],
        },
        {
            path: '/GroundTruthReviewCDKStack/statemachine/Role/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'These actions are not tied to a resurce.',
            appliesTo: ['Resource::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/ExecutionRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'These actions are not tied to a resurce.',
            appliesTo: ['Resource::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'These are needed to work with encrypted S3 staging bucket.',
            appliesTo: ['Action::kms:GenerateDataKey*', 'Action::kms:ReEncrypt*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'SNS topic externally supplied at runtime.',
            appliesTo: [`Resource::arn:<AWS::Partition>:sns:ap-south-1:${accountId}:*`],
        },
        {
            path: 'GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'This is needed to be able to create log groups.',
            appliesTo: [`Resource::arn:<AWS::Partition>:logs:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Stepfunction tokens are not tied to a resource.',
            appliesTo: [`Resource::arn:<AWS::Partition>:states:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'This is needed to create human review loops under a flow definition.',
            appliesTo: [`Resource::arn:<AWS::Partition>:sagemaker:ap-south-1:${accountId}:flow-definition/*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/data-preparation-task-construct/data-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'This is needed to access output S3 bucket specified at runtime.',
            appliesTo: ['Resource::arn:<AWS::Partition>:s3:::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/ExecutionRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'ECR authorization is not tied to a resource.',
            appliesTo: ['Resource::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/ExecutionRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'ECR authorization is not tied to a resource.',
            appliesTo: ['Resource::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Task needs to work with excrypted staging bucket.',
            appliesTo: ['Action::kms:GenerateDataKey*', 'Action::kms:ReEncrypt*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'SNS topic externally supplied at runtime.',
            appliesTo: [`Resource::arn:<AWS::Partition>:sns:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'This is needed to be able to create log groups.',
            appliesTo: [`Resource::arn:<AWS::Partition>:logs:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Task token APIs are not tied to a resource.',
            appliesTo: [`Resource::arn:<AWS::Partition>:states:ap-south-1:${accountId}:*`],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-preparation-task-construct/review-preparation-task-construct_task_definition/TaskRole/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'This is needed to access output S3 bucket specified at runtime.',
            appliesTo: ['Resource::arn:<AWS::Partition>:s3:::*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/human_review_task_role/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Task needs to work with excrypted staging bucket.',
            appliesTo: ['Action::kms:GenerateDataKey*', 'Action::kms:ReEncrypt*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/human_review_task_role/DefaultPolicy/Resource',
            id: 'AwsSolutions-IAM5',
            reason: 'Task needs to provide full access to staging bucket.',
            appliesTo: ['Resource::<stagingbucketC62ECAF7.Arn>/*', 'Action::s3:Abort*', 'Action::s3:DeleteObject*', 'Action::s3:List*', 'Action::s3:GetBucket*', 'Action::s3:GetObject*'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-ui-construct/provider/framework-onEvent/ServiceRole/Resource',
            id: 'AwsSolutions-IAM4',
            reason: 'AWSLambdaBasicExecutionRole is safe to use.',
            appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
            path: '/GroundTruthReviewCDKStack/review-ui-construct/resource-function/ServiceRole/Resource',
            id: 'AwsSolutions-IAM4',
            reason: 'AWSLambdaBasicExecutionRole is safe to use.',
            appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
    ];

    items.forEach(item => {
        cdkNag.NagSuppressions.addResourceSuppressionsByPath(
            stack,
            item.path,
            [
                { id, reason, appliesTo } = item,
            ]
        );
    });
};