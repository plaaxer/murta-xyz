# main.tf — Root module. Wires together all resources for the cloud resume stack.
#
# Resources to define here:
#   - S3 bucket for static site hosting (index.html, style.css)
#   - S3 bucket policy to allow public read
#   - CloudFront distribution in front of the S3 bucket (HTTPS + CDN)
#   - DynamoDB table to store the visitor counter (partition key: "id")
#   - Lambda function that reads and increments the DynamoDB counter
#   - IAM role + policy granting Lambda permission to access DynamoDB
#   - API Gateway (HTTP API) that exposes the Lambda as a GET /count endpoint
#   - CORS configuration on API Gateway so the browser can call it

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # TODO: configure remote state backend (S3 + DynamoDB lock) once the bucket exists
  # backend "s3" { ... }
}

provider "aws" {
  region = var.aws_region
}