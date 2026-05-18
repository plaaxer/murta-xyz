# lambda.tf — Lambda function that handles the visitor counter.
#
# Things to define here:
#   - aws_lambda_function resource pointing to the zipped function code
#   - aws_iam_role for Lambda execution (trust policy: lambda.amazonaws.com)
#   - aws_iam_role_policy_attachment for AWSLambdaBasicExecutionRole (CloudWatch logs)
#   - aws_iam_policy + aws_iam_role_policy_attachment granting DynamoDB GetItem/UpdateItem
#     on the visitor counter table
#
# The function logic (Python or Node) lives outside infra/, e.g. in api/handler.py.
# Package it with: zip -j api/handler.zip api/handler.py