# outputs.tf — Values to print after `terraform apply` (and usable by other modules).
#
# Useful outputs to expose:
#   - CloudFront distribution domain name (the URL to open in the browser)
#   - S3 bucket name (handy for the deploy script that syncs site files)
#   - API Gateway invoke URL (paste this into site/index.html API_URL constant)
#   - DynamoDB table name