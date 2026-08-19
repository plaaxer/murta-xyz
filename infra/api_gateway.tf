# api declaration
resource "aws_apigatewayv2_api" "counting_api" {
  name          = "counting_api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["https://murta.xyz"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
    max_age       = 300
  }
}

# integrating with lambda
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.counting_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.visitor_counter_lambda.invoke_arn
  payload_format_version = "2.0"
}

# api get endpoint
resource "aws_apigatewayv2_route" "get_count" {
  api_id    = aws_apigatewayv2_api.counting_api.id
  route_key = "GET /count"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# default stage
resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.counting_api.id
  name        = "$default"
  auto_deploy = true

  route_settings {
    route_key              = "POST /posts/{slug}/comments"
    throttling_rate_limit  = 1
    throttling_burst_limit = 3
  }
}

# permission to execute
resource "aws_lambda_permission" "api_gw_invoke" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.visitor_counter_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.counting_api.execution_arn}/*/*"
}

output "api_invoke_url" {
  description = "Counting API endpoint"
  value       = "${aws_apigatewayv2_api.counting_api.api_endpoint}/count"
}
