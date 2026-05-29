
# defining region n provider
provider "aws" {
  region = "us-east-2"
}

# visitor counting DynamoDB table
resource "aws_dynamodb_table" "visitor_counter" {
  name = "visitor-counter"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Project = "Cloud Resume Challenge"
    Environment = "Production"
  }
}

# zipping lambda function
data "archive_file" "lambda_zip" {
  type = "zip"
  source_file = "${path.module}/lambda/lambda_function.py"
  output_path = "${path.module}/lambda/lambda_function.zip"
}

# iam role for lambda
resource "aws_iam_role" "lambda_exec_role" {
  name = "resume_visitor_counter_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# iam role allow access to dynamo db table (visitor_counter). ig that this allows access to all tables?
resource "aws_iam_role_policy_attachment" "lambda_dynamodb_access" {
  role = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

# lambda function def. we give it the role we just created.
resource "aws_lambda_function" "visitor_counter_lambda" {
  filename = data.archive_file.lambda_zip.output_path
  function_name = "resume_visitor_counter"
  role = aws_iam_role.lambda_exec_role.arn
  handler = "lambda_function.lambda_handler"
  runtime = "python3.12"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.visitor_counter.name
    }
  }
}

