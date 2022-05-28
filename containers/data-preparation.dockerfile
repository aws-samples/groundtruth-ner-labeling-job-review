FROM alpine:3

RUN apk add --upgrade apk-tools
RUN apk update
RUN apk upgrade --available

RUN apk add --no-cache python3 py3-pip python3
RUN python3 -m ensurepip
RUN pip install boto3

COPY code/data-preparation.py main.py
COPY code/utils.py utils.py

WORKDIR /
CMD ["python3", "/main.py"]