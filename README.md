# Introduction
This AWS Sample demonstrates how to review and modify named entitity recognition (NER) labelling done with AWS Sagemager GroungTruth jobs. It leverages Amazon Augmented AI (A2I) to create and preset the human reviewer with a UI that is similar to the one used in GroundTruth and allows for add, remove and editing of labels.

With this capability, it is possible to implement review and approval workflows for existing data from GroundTruth and thus improve the overall quality of the labels. The outout from the process is in the same format used by GroundTruth and hence can be used for more reviews and refinement for any numer of times.

# Architecture
![GroundTruth review AWS Sample - architecture](./architecture.svg)

This AWS Sample uses a completely serverless solution. The input and output buckets are outside the scope of the solution and are assumed to pre-exist. An execution is started by invoking the StepFunction statemachine with the data specified in the `Setting up` section below.

Once started, the `Review preparation task` reads the input manifest file and created A2I review jobs for each document in the file. It will also add entries in the DynamoDB table for tracking their completion. It also inserts the StepFunction TaskToken into the table for use by the `Continue function` as given below.

When a document gets reviewed or rejected, A2I emits an event to EventBridge which will then invoke the `Continue function`. This Lambda function remove the corresponding entry from the DynamoDB table and check if all documents have been reviewed. If all documents are done, then it gets the StepFunction TaskToken from the table and sends it to StepFunctions to make the execution more forward.

The A2I reviews are configured to put the review data in a temporary S3 bucket created by the solution. The `Data preparation` ECS task will gather all the data for the current execution from this temporary bucket and will assemble the reviewed manifest file. It will then copy the file to the specified output object.

The solution is packaged as a CDK project and can be deployed easily using the process outlined in the `Setting up` section below.

# Setting up
## Prerequisites
- Ubuntu 20 development machine.
- AWS Account with admin rights.
- Existing manifest file from GroundTruth NER labelling job.
- Existing GroundTruth workforce team to do the review.
- A VPC with outbound traffic allowed (NAT).
- Have a Customer master key (CMK) in KMS.
- An SNS topic to deliver events to.
## Deployment
- Configure the solution.
    - Edit /cdk/cdj.json and update the following.
        - CMK_ARN (ARN of the customer master key in KMS.)
        - VPC_ID (Id of the VPC to be used for the ECS tasks.)
        - SUBNET_IDS (For security reasons, deploy into private subnets with access to NAT.)
        - VPC_SECURITYGROUP_ID (Id of the SecurityGroup to be used for the ECS tasks.)
        - ENTITY_REVIEW_UI_NAME (A unique name for the UI used for the A2I review.)
        - TASK_CPU
        - TASK_RAM
        - CONTAINER_RAM
        - LOG_LEVEL (Could be DEBUG, INFO, WARNING or ERROR)
        - ACCESS_LOG_BUCKET (ARN of the access log bucket.)
        - ACCESS_LOG_PREFIX (A key prefix for the access logs. e.g groundtruth-review)
- Deploy the solution
    ```
    ./prepare-ubuntu.sh
    ./prepare-project.sh

    cd cdk
    cdk deploy
    ```
## Testing
- Start a statemachine execution with the following data.
    ```
    {
    "INPUT_MANIFEST": "<s3 url for the input manifest file. e.g s3://groundtruth-review/input.manifest>",
    "OUTPUT_MANIFEST": "<s3 url for the input manifest file. e.g s3://groundtruth-review/output.manifest>",
    "LABEL_ATTRIBUTE_NAME": "<The label attribute name used in GroundTruth labelling job>",
    "WORK_TEAM_ARN": "<ARN of the reviewing work team. e.g. arn:aws:sagemaker:ap-south-1:000000000000:workteam/private-crowd/review-team>",
    "SNS_TOPIC_ARN": "ARN of the SNS topic to send review READY/COMPLETE events. e.g arn:aws:sns:ap-south-1:000000000000:review-topic",
    "EXECUTION_NAME": "A human readable name for this execution which will be used in the SNS notifications."
    }
    ```
- Wait for the REVIEW_STARTED SNS notification. (You can subscribe by email or have the SNS topic connected to the review team for getting the notifications.)
- Complete the reviews and submit the documents in the A2I human review UI.
- Wait for the REVIEW_COMPLETE SNS notification.
- At this point, the final reviewed manifest file will be present in the specified location.


