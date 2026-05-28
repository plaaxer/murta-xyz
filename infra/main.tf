
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
resource "archive_file" "lambda_zip" {
  type = "zip"
  source_file = "${path.module}/lambda/lambda_function.py"
  output_file = "${path.module}/lambda/lambda_function.zip"
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

# todo: finish integrations w role and lambda, delete remote stateless stuff and apply

