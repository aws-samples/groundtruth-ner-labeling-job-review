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
import os
import time
import logging

import utils

try:
    logging.getLogger().setLevel(utils.getLogLevel())
    logging.info('Starting...')

    # Extract data from environment variables.
    TASK_TOKEN = os.environ['TASK_TOKEN']
    EXECUTION_ID = os.environ['EXECUTION_ID'][os.environ['EXECUTION_ID'].rindex(':')+1:]
    WORK_TEAM_ARN = os.environ['WORK_TEAM_ARN']
    WORK_TEMPLATE_ARN = os.environ['WORK_TEMPLATE_ARN']
    REVIEW_TASK_ROLE = os.environ['REVIEW_TASK_ROLE']
    STAGING_BUCKET_NAME = os.environ['STAGING_BUCKET_NAME']
    LABEL_ATTRIBUTE_NAME = os.environ['LABEL_ATTRIBUTE_NAME']
    STAGING_TABLE_NAME = os.environ['STAGING_TABLE_NAME']
    SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']
    EXECUTION_NAME = os.environ['EXECUTION_NAME']
    INPUT_MANIFEST = os.environ['INPUT_MANIFEST']
    logging.info('Environment variables extracted')

    # Prepare AWS objects.
    s3 = boto3.client('s3')
    sagemaker = boto3.client('sagemaker')
    step_functions = boto3.client('stepfunctions')
    a2i_runtime_client = boto3.client('sagemaker-a2i-runtime')
    dynamodb = boto3.client('dynamodb')
    sns = boto3.client('sns')
    logging.info('AWS Objects created')

    # Copy input manifest file.
    utils.downloadFile(INPUT_MANIFEST, '/input.manifest')
    logging.info('File downloaded')

    # Create flow definition for the review.
    flow_definition_response = sagemaker.create_flow_definition(
        FlowDefinitionName = 'flow-'+EXECUTION_ID,
        HumanLoopConfig={
            'WorkteamArn': WORK_TEAM_ARN,
            'HumanTaskUiArn': WORK_TEMPLATE_ARN,
            'TaskTitle': 'entity-review',
            'TaskDescription': 'Review for entities.',
            'TaskCount': 1,
            'TaskAvailabilityLifetimeInSeconds': 60*60*24*10
        },
        OutputConfig={
            'S3OutputPath': 's3://' + STAGING_BUCKET_NAME + '/reviewed/' + EXECUTION_ID,
        },
        RoleArn=REVIEW_TASK_ROLE
    )
    logging.info('Flow definition created')

    # Wait for the flow definition to be active.
    while True:
        flow_definition_status = sagemaker.describe_flow_definition(
            FlowDefinitionName = 'flow-'+EXECUTION_ID,
        )

        if flow_definition_status['FlowDefinitionStatus'] == 'Active':
            break

        time.sleep(0.1)
    logging.info('Flow definition is ready')

    index = 0
    loopsCreated = False

    # Process each line of data from the input manifest file.
    with open('/input.manifest', 'r') as manifest_file:
        while True:
            line = manifest_file.readline()
            if not line:
                break

            logging.debug('Processing record: '+line)
            data = json.loads(line)
            index += 1
            
            # Create human review task for each record.
            response = a2i_runtime_client.start_human_loop(
                    HumanLoopName = EXECUTION_ID + '-' + str(index),
                    FlowDefinitionArn = flow_definition_response['FlowDefinitionArn'],
                    HumanLoopInput = {
                        'InputContent': json.dumps({
                                'text' : data['source'],
                                'labels' : data[LABEL_ATTRIBUTE_NAME]['annotations']['labels'],
                                'initialValue' : data[LABEL_ATTRIBUTE_NAME]['annotations']['entities']
                            })
                    },
                    DataAttributes = {
                        'ContentClassifiers': [
                            'FreeOfPersonallyIdentifiableInformation',
                        ]
                    }
                )
            logging.info('Human loop started')

            # Add an entry in the DDB table.
            dynamodb.put_item(TableName=STAGING_TABLE_NAME, Item={
                    'ExecutionId':{'S':EXECUTION_ID},
                    'Index':{'S': EXECUTION_ID + '-' + str(index)}
                    }
                )
            logging.info('DDB record added')

            # Register the processed record.
            loopsCreated = True
            logging.info('Processed: ' + str(index))
                    
    # Delete the flow if there was no reviews created and make the step function move forward. Otherwise, add TASK_TOKEN to DDB table.
    if not loopsCreated:
        logging.info('No human loops needed.')
        sagemaker.delete_flow_definition(
                FlowDefinitionName = 'flow-'+EXECUTION_ID,
            )
        logging.info('Flow definition deleted')

        step_functions.send_task_success(
            taskToken=TASK_TOKEN,
            output=json.dumps({}), 
        )
        logging.info('Sent success to StepFunctions')

    else:
        dynamodb.put_item(TableName=STAGING_TABLE_NAME, Item={
                    'ExecutionId':{'S':EXECUTION_ID},
                    'Index':{'S': 'TASK_TOKEN'},
                    'TASK_TOKEN':{'S': TASK_TOKEN}
                    }
                )
        logging.info('Added token to DDB table')

    # Send review-started notification
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Message=json.dumps({
                'type': 'REVIEW_STARTED',
                'name': EXECUTION_NAME
            }),
        Subject=f'Review started for {EXECUTION_NAME}'
    )
    logging.info('SNS notification sent')

except Exception as e:
    logging.error("An exception occurred: " + str(e))

    step_functions.send_task_failure(
            taskToken=TASK_TOKEN,
            output=json.dumps(e), 
        )

    logging.info('Failure sent to StepFunctions.')
