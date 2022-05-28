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

const AWS = require('aws-sdk');
const winston = require('winston');

// Create AWS clients.
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const stepfunctions = new AWS.StepFunctions({ apiVersion: '2016-11-23' });
const sagemaker = new AWS.SageMaker({ apiVersion: '2017-07-24' });

// Create logger.
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL.toLowerCase() || 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
    ],
});

/**
 * Function to process a document once A2I sends an event for its status change.
 * 
 * @param {*} event Event object.
 * @param {*} context Context object.
 */
exports.handler = async function (event, context) {
    logger.info('Starting...');

    // Extract data from the event.
    const index = event.detail.humanLoopName.lastIndexOf('-');
    const executionId = event.detail.humanLoopName.substring(0, index);
    logger.debug('Event data: ', index, executionId);

    // Delete corresponding record from the DDB table.
    const deleteResult = await docClient.delete({
        TableName: process.env.TABLE_NAME,
        Key: {
            ExecutionId: executionId,
            Index: event.detail.humanLoopName
        },
        ReturnValues: 'ALL_OLD'
    }).promise();
    logger.info('Table enry deleted');

    // Check if there are more documents to be processed.
    let count = 0;
    let exclusiveStartKey = undefined;
    while (true) {
        const queryResult = await docClient.query({
            TableName: process.env.TABLE_NAME,
            Limit: 2,
            ExpressionAttributeNames: {
                '#ExecutionId': 'ExecutionId',
            },
            ExpressionAttributeValues: {
                ':ExecutionId': executionId
            },
            KeyConditionExpression: '#ExecutionId = :ExecutionId',
            ExclusiveStartKey: exclusiveStartKey
        }).promise();

        count += queryResult.Count;
        if (count > 1 || !queryResult.LastEvaluatedKey) {
            break;
        }

        exclusiveStartKey = queryResult.LastEvaluatedKey;
    }
    logger.info('Remaing records: ', count);

    // If only the TASK_TOKEN record is left.
    if (count == 1) {
        logger.info('All documents are processed');

        // Delete the record from the DDB table.
        const tokenDeleteResult = await docClient.delete({
            TableName: process.env.TABLE_NAME,
            Key: {
                ExecutionId: executionId,
                Index: 'TASK_TOKEN'
            },
            ReturnValues: 'ALL_OLD'
        }).promise();
        logger.info('Token record deleted');

        //Delete the human review flow
        await sagemaker.deleteFlowDefinition({
            FlowDefinitionName: 'flow-' + executionId
        }).promise();
        logger.info('Flow deleted');

        // Resume stepfunction execution.
        await stepfunctions.sendTaskSuccess({
            taskToken: tokenDeleteResult.Attributes.TASK_TOKEN,
            output: JSON.stringify({
                EXECUTION_ID: executionId
            })
        }).promise();
        logger.info('Success sent to StepFunctions');

    } else {
        logger.info('Documents remains to be processed');
    }
}
