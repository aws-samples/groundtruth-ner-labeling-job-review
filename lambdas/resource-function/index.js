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
const fs = require('fs');
const winston = require('winston');

// Create AWS client.
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
 * Function implementing the logic for the custom CDK resource to manage creation and
 * deletion of the human review UI in A2I.
 * 
 * @param {*} event Event object.
 * @param {*} context Context object.
 */
exports.handler = async function (event, context) {
    logger.info('Starting...');

    // Switch on the event type.
    switch (event.RequestType) {
        // Create the resource.
        case 'Create': {
            logger.info('Creating worker template');

            // Retrieve the content.
            const body = fs.readFileSync(__dirname + '/worker-template.html', 'utf8');
            logger.info('Reading body');

            // Create the human review ui.
            const result = await sagemaker.createHumanTaskUi({
                HumanTaskUiName: process.env.ENTITY_REVIEW_UI_NAME,
                UiTemplate: {
                    Content: body
                }
            }).promise();
            logger.debug('Result', result);

            logger.info('Done');
            // Return the identifiers.
            return {
                PhysicalResourceId: result.HumanTaskUiArn,
                Data: {
                    HumanTaskUiArn: result.HumanTaskUiArn
                }
            };
        }

        // Delete the resource.
        case 'Delete': {
            logger.info('Deleting worker template');

            // Delete the human review ui.
            const result = await sagemaker.deleteHumanTaskUi({
                HumanTaskUiName: process.env.ENTITY_REVIEW_UI_NAME,
            }).promise();
            logger.debug('Result', result);

            logger.info('Done');
            return {};
        }
    }

}
