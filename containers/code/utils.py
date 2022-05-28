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

from urllib.parse import urlparse
import boto3
import os
import logging

# Create S3 resource object.
s3 = boto3.resource('s3')

def getLogLevel():
    """Gets the log level set up by the deployment."""
    dict = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'ERROR': logging.ERROR,
    }

    return dict[os.environ['LOG_LEVEL']]

def downloadFile(s3Url, path):
    """Downloads a file from S3 to local file system."""
    logging.debug('downloadFile: ' + s3Url + ' , ' + path)
    parsedUrl = urlparse(s3Url, allow_fragments=False)
    s3.Bucket(parsedUrl.netloc).download_file(parsedUrl.path[1:], path)

def uploadFile(path, s3Url):
    """Uploads a file from local file system to S3."""
    logging.debug('uploadFile: ' + path + ' , ' + s3Url)
    parsedUrl = urlparse(s3Url, allow_fragments=False)
    s3.Bucket(parsedUrl.netloc).put_object(Key = parsedUrl.path[1:], Body = open(path, 'rb')
)

def downloadFolder(s3Url, path):
    """Downloads a folder from S3 to local file system."""
    logging.debug('downloadFolder: ' + s3Url + ' , ' + path)
    parsedUrl = urlparse(s3Url, allow_fragments=False)
    bucket = s3.Bucket(parsedUrl.netloc) 
    for obj in bucket.objects.filter(Prefix = parsedUrl.path[1:]):
        #Exclude root object.
        if obj.key == parsedUrl.path[1:]:
            continue

        #Create folders if needed
        filePath = obj.key[len(parsedUrl.path)-1:]
        if not os.path.exists(os.path.dirname(path+'/'+filePath)):
            os.makedirs(os.path.dirname(path+'/'+filePath))

        bucket.download_file(obj.key, path+'/'+filePath)

def uploadFolder(path, s3Url):
    """Uploads a folder from local file system to S3."""
    logging.debug('uploadFolder: ' + path + ' , ' + s3Url)
    parsedUrl = urlparse(s3Url, allow_fragments=False)
    for root,dirs,files in os.walk(path):
        for file in files:
            s3.Bucket(parsedUrl.netloc).put_object(Key = parsedUrl.path[1:] + os.path.join(root,file)[len(path)+1:], Body = open(os.path.join(root,file), 'rb'))

