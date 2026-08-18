resource "aws_dynamodb_table" "posts" {
  name         = "murta-posts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Project     = "Cloud Resume Challenge"
    Environment = "Production"
  }
}

data "archive_file" "posts_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda/posts_function.py"
  output_path = "${path.module}/lambda/posts_function.zip"
}

resource "aws_iam_role" "posts_lambda_role" {
  name = "resume_posts_role"

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

resource "aws_iam_role_policy" "posts_dynamodb_access" {
  name = "posts_dynamodb_access"
  role = aws_iam_role.posts_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ]
      Resource = aws_dynamodb_table.posts.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "posts_lambda_logging" {
  role       = aws_iam_role.posts_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "posts" {
  filename         = data.archive_file.posts_lambda_zip.output_path
  function_name    = "resume_posts"
  role             = aws_iam_role.posts_lambda_role.arn
  handler          = "posts_function.lambda_handler"
  runtime          = "python3.12"
  source_code_hash = data.archive_file.posts_lambda_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.posts.name
    }
  }
}

resource "aws_apigatewayv2_integration" "posts" {
  api_id                 = aws_apigatewayv2_api.counting_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.posts.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.counting_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "murta-posts-owner"

  jwt_configuration {
    audience = ["2frsnd4iqd3itkdnm3bpdog8cf"]
    issuer   = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_wQfcNZmjN"
  }
}

resource "aws_apigatewayv2_route" "get_posts" {
  api_id    = aws_apigatewayv2_api.counting_api.id
  route_key = "GET /posts"
  target    = "integrations/${aws_apigatewayv2_integration.posts.id}"
}

resource "aws_apigatewayv2_route" "create_post" {
  api_id               = aws_apigatewayv2_api.counting_api.id
  route_key            = "POST /posts"
  target               = "integrations/${aws_apigatewayv2_integration.posts.id}"
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.cognito.id
  authorization_scopes = ["openid"]
}

resource "aws_apigatewayv2_route" "create_comment" {
  api_id    = aws_apigatewayv2_api.counting_api.id
  route_key = "POST /posts/{slug}/comments"
  target    = "integrations/${aws_apigatewayv2_integration.posts.id}"
}

resource "aws_lambda_permission" "posts_api_invoke" {
  statement_id  = "AllowPostsExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.posts.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.counting_api.execution_arn}/*/*"
}

output "posts_api_url" {
  description = "Posts API endpoint"
  value       = aws_apigatewayv2_api.counting_api.api_endpoint
}
