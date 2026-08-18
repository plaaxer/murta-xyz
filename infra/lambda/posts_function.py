import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def request_body(event):
    try:
        value = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError as error:
        raise ValueError("Request body must be valid JSON") from error
    if not isinstance(value, dict):
        raise TypeError("Request body must be a JSON object")
    return value


def clean_text(value, field, minimum, maximum):
    if not isinstance(value, str):
        raise TypeError(f"{field} is required")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ValueError(f"{field} must contain {minimum}-{maximum} characters")
    return value


def public_comment(item):
    return {
        "id": item["id"],
        "name": item["name"],
        "body": item["body"],
        "createdAt": item["createdAt"],
    }


def comments_for(slug):
    result = table.query(
        KeyConditionExpression=Key("PK").eq(f"POST#{slug}") & Key("SK").begins_with("COMMENT#")
    )
    return [public_comment(item) for item in result.get("Items", [])]


def list_posts():
    result = table.scan(FilterExpression=Attr("SK").eq("POST"))
    items = result.get("Items", [])
    while "LastEvaluatedKey" in result:
        result = table.scan(
            FilterExpression=Attr("SK").eq("POST"),
            ExclusiveStartKey=result["LastEvaluatedKey"],
        )
        items.extend(result.get("Items", []))

    posts = []
    for item in items:
        posts.append(
            {
                "slug": item["slug"],
                "title": item["title"],
                "deck": item["deck"],
                "body": item["body"],
                "publishedAt": item["publishedAt"],
                "comments": comments_for(item["slug"]),
            }
        )
    posts.sort(key=lambda post: post["publishedAt"], reverse=True)
    return response(200, {"items": posts})


def create_post(event):
    body = request_body(event)
    slug = clean_text(body.get("slug"), "slug", 1, 100).lower()
    if not SLUG_PATTERN.fullmatch(slug):
        raise ValueError("slug can contain only lowercase letters, numbers, and hyphens")

    paragraphs = body.get("body")
    if not isinstance(paragraphs, list) or not paragraphs:
        raise ValueError("body must contain at least one paragraph")
    paragraphs = [clean_text(paragraph, "paragraph", 1, 10000) for paragraph in paragraphs]
    published_at = datetime.now(timezone.utc).isoformat()
    item = {
        "PK": f"POST#{slug}",
        "SK": "POST",
        "slug": slug,
        "title": clean_text(body.get("title"), "title", 1, 120),
        "deck": clean_text(body.get("deck"), "deck", 1, 240),
        "body": paragraphs,
        "publishedAt": published_at,
    }
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(409, {"error": "A post with that slug already exists"})
        raise
    return response(
        201,
        {
            "slug": slug,
            "title": item["title"],
            "deck": item["deck"],
            "body": paragraphs,
            "publishedAt": published_at,
            "comments": [],
        },
    )


def create_comment(event, slug):
    existing = table.get_item(Key={"PK": f"POST#{slug}", "SK": "POST"}).get("Item")
    if not existing:
        return response(404, {"error": "Post not found"})

    body = request_body(event)
    comment_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    item = {
        "PK": f"POST#{slug}",
        "SK": f"COMMENT#{created_at}#{comment_id}",
        "id": comment_id,
        "name": clean_text(body.get("name"), "name", 1, 40),
        "email": clean_text(body.get("email"), "email", 3, 120),
        "body": clean_text(body.get("body"), "body", 3, 2000),
        "createdAt": created_at,
    }
    table.put_item(Item=item)
    return response(201, public_comment(item))


def lambda_handler(event, context):
    del context
    method = event.get("requestContext", {}).get("http", {}).get("method")
    path = event.get("rawPath", "")
    try:
        if method == "GET" and path == "/posts":
            return list_posts()
        if method == "POST" and path == "/posts":
            return create_post(event)
        if method == "POST" and path.endswith("/comments"):
            slug = event.get("pathParameters", {}).get("slug", "")
            return create_comment(event, slug)
        return response(404, {"error": "Not found"})
    except (TypeError, ValueError) as error:
        return response(400, {"error": str(error)})
    except Exception:
        logger.exception("Posts request failed")
        return response(500, {"error": "Internal server error"})
