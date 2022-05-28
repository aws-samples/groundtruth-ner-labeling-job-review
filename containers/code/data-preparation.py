# /*
#  * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
#  * SPDX-License-Identifier: MIT-0
#  *
#  * Permission is hereby granted, free of charge, to any person obtaining a copy of this
#  * software and associated documentation files (the "Software"), to deal in the Software
#  * without restriction, including without limitation the rights to use, copy, modify,
#  * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
#  * permit persons to whom the Software is furnished to do so.
#  *
#  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
#  * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
#  * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
#  * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
#  * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
#  * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#  */

import boto3
import json
import sys
import os
import csv
import logging

import utils

try:
    logging.getLogger().setLevel(utils.getLogLevel())
    logging.info('Starting...')

    # Extract data from environment variables.
    LABEL_ATTRIBUTE_NAME = os.environ['LABEL_ATTRIBUTE_NAME']
    INPUT_MANIFEST = os.environ['INPUT_MANIFEST']
    STAGING_BUCKET_NAME = os.environ['STAGING_BUCKET_NAME']
    EXECUTION_ID = os.environ['EXECUTION_ID'][os.environ['EXECUTION_ID'].rindex(':')+1:]
    OUTPUT_MANIFEST = os.environ['OUTPUT_MANIFEST']
    TASK_TOKEN = os.environ['TASK_TOKEN']
    SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']
    EXECUTION_NAME = os.environ['EXECUTION_NAME']
    logging.info('Environment variables extracted')

    # Prepare AWS objects.
    sns = boto3.client('sns')
    step_functions = boto3.client('stepfunctions')
    logging.info('AWS Objects created')

    # Copy input manifest file and review data.
    utils.downloadFile(INPUT_MANIFEST, '/input.manifest')
    utils.downloadFolder(f's3://{STAGING_BUCKET_NAME}/reviewed/{EXECUTION_ID}/', '/reviewed')
    logging.info('Files downloaded')

    # Extract reusable items from first record in input.manifest
    with open('/input.manifest', 'r') as input_file:
        line = input_file.readline()
        input_data = json.loads(line)

        with open('/output.manifest', 'w') as output_file:
            # Process all json files in the reviewed folder.
            for root, dirs, files in os.walk('/reviewed'):
                for file in files:
                    if file.endswith('output.json'):
                        with open(os.path.join(root, file), 'r') as  review_file:
                            reviewed_data = json.load(review_file)
                            logging.debug('Processing review data: ' + review_file.name)

                            # Create record in the GroundTruth NER labelling job's format.
                            record = json.dumps({
                                'source' : reviewed_data['inputContent']['text'].strip(),
                                LABEL_ATTRIBUTE_NAME + '-metadata' : input_data[LABEL_ATTRIBUTE_NAME + '-metadata'],
                                LABEL_ATTRIBUTE_NAME : {
                                    'annotations' : {
                                        'labels' : input_data[LABEL_ATTRIBUTE_NAME]['annotations']['labels'],
                                        'entities' : reviewed_data['humanAnswers'][0]['answerContent']['crowd-entity-annotation']['entities'] if len(reviewed_data['humanAnswers']) > 0 else reviewed_data['inputContent']['initialValue'] 
                                    }
                                }
                            })

                            # Add to the JSONL manifest file.
                            output_file.write(record + '\n')
                            logging.debug('Wrote updated record: ' + record)

    # Copy final output to specified object
    utils.uploadFile('/output.manifest', OUTPUT_MANIFEST)
    logging.info('Uploaded output manifest file.')

    # Make the step function move forward.
    step_functions.send_task_success(
        taskToken=TASK_TOKEN,
        output=json.dumps({}), 
    )
    logging.info('Success sent to StepFunctions.')

    # Send review-complete notification
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Message=json.dumps({
                'type': 'REVIEW_COMPLETE',
                'name': EXECUTION_NAME
            }),
        Subject=f'Review completed for {EXECUTION_NAME}'
    )
    logging.info('SNS notification SENT.')

except Exception as e:
    logging.error("An exception occurred: " + str(e))

    step_functions.send_task_failure(
            taskToken=TASK_TOKEN,
            output=json.dumps(e), 
        )
    logging.info('Failure sent to StepFunctions.')