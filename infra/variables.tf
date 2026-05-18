# variables.tf — Input variables for the stack.
#
# Add a variable for every value that differs between environments (dev/prod)
# or that you don't want hard-coded (account IDs, domain names, etc.).

variable "aws_region" {
  description = "AWS region to deploy all resources into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used as a prefix for resource names"
  type        = string
  default     = "cloud-resume"
}

# TODO: add variable for custom domain name (used in CloudFront + ACM cert)
# TODO: add variable for environment (dev / prod)