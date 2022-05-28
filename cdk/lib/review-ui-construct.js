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
const { Stack, Duration, CustomResource } = require('aws-cdk-lib');

const lambda = require('aws-cdk-lib').aws_lambda;
const iam = require('aws-cdk-lib').aws_iam;
const cr = require('aws-cdk-lib').custom_resources;

/**
 * Custom construct to abstract the ECS tasks.
 */
class ReviewUIConstruct extends Construct {
    /**
     * Constructor for the CDK construct.
     * @param {Construct} scope Scope for the construct.
     * @param {string} id ID for the construct.
     * @param {StackProps} props Props for the construct.
     */
    constructor(scope, id, props) {
        super(scope, id, props);

        // Create Lambda function implementing logic for the custom resource.
        const resourceFunction = new lambda.Function(this, 'resource-function', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../lambdas/resource-function/'),
            timeout: Duration.minutes(15),
            environment: {
                ENTITY_REVIEW_UI_NAME: props.entityReviewUIName,
                LOG_LEVEL: props.logLevel
            }
        });

        // Setup permissions.
        resourceFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'sagemaker:CreateHumanTaskUi',
                'sagemaker:DeleteHumanTaskUi',
            ],
            resources: [
                `arn:${Stack.of(this).partition}:sagemaker:${Stack.of(this).region}:${Stack.of(this).account}:human-task-ui/${props.entityReviewUIName}`
            ]
        }));

        // Create provider.
        const myProvider = new cr.Provider(this, 'provider', {
            onEventHandler: resourceFunction,
        });

        // Create custom resource.
        this.customResource = new CustomResource(this, 'custom-resource', {
            serviceToken: myProvider.serviceToken
        });
    }

    /**
     * Get the Arn of the human task UI.
     * @returns Arn of the human task UI.
     */
    getHumanTaskUiArn() {
        return this.customResource.getAttString('HumanTaskUiArn')
    }
}

module.exports = ReviewUIConstruct;