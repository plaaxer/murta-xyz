import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'visitor-counter')
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    try:
        response = table.update_item(
            Key={'id': '0'},
            UpdateExpression="ADD visitors :inc",
            ExpressionAttributeValues={':inc': 1},
            ReturnValues="UPDATED_NEW"
        )
        
        latest_count = int(response['Attributes']['visitors'])
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({'count': latest_count})
        }
        
    except Exception:
        logger.exception("Failed to update visitor counter")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal Server Error'})
        }
