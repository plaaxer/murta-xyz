import json
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


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


def slug_from_title(title):
    normalized = (
        unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    )
    slug = (
        re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:100].rstrip("-")
    )
    if not slug:
        raise ValueError("title must contain letters or numbers that can form a URL")
    return slug


def clean_tags(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise TypeError("tags must be a list")
    if len(value) > 10:
        raise ValueError("tags cannot contain more than 10 entries")
    tags = []
    normalized_tags = set()
    for tag in value:
        cleaned = clean_text(tag, "tag", 1, 30)
        normalized = cleaned.casefold()
        if normalized not in normalized_tags:
            tags.append(cleaned)
            normalized_tags.add(normalized)
    return tags


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
                "tags": item.get("tags", []),
                "body": item["body"],
                "publishedAt": item["publishedAt"],
                "comments": comments_for(item["slug"]),
            }
        )
    posts.sort(key=lambda post: post["publishedAt"], reverse=True)
    return response(200, {"items": posts})


def create_post(event):
    body = request_body(event)
    title = clean_text(body.get("title"), "title", 1, 120)
    slug = slug_from_title(title)

    paragraphs = body.get("body")
    if not isinstance(paragraphs, list):
        raise TypeError("body must be a list of paragraphs")
    if not paragraphs:
        raise ValueError("body must contain at least one paragraph")
    paragraphs = [
        clean_text(paragraph, "paragraph", 1, 10000) for paragraph in paragraphs
    ]
    published_at = datetime.now(timezone.utc).isoformat()
    item = {
        "PK": f"POST#{slug}",
        "SK": "POST",
        "slug": slug,
        "title": title,
        "tags": clean_tags(body.get("tags")),
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
            "tags": item["tags"],
            "body": paragraphs,
            "publishedAt": published_at,
            "comments": [],
        },
    )


def update_post(event, slug):
    body = request_body(event)
    title = clean_text(body.get("title"), "title", 1, 120)
    paragraphs = body.get("body")
    if not isinstance(paragraphs, list):
        raise TypeError("body must be a list of paragraphs")
    if not paragraphs:
        raise ValueError("body must contain at least one paragraph")
    paragraphs = [
        clean_text(paragraph, "paragraph", 1, 10000) for paragraph in paragraphs
    ]
    tags = clean_tags(body.get("tags"))
    try:
        result = table.update_item(
            Key={"PK": f"POST#{slug}", "SK": "POST"},
            UpdateExpression="SET #title = :title, #tags = :tags, #body = :body",
            ExpressionAttributeNames={
                "#title": "title",
                "#tags": "tags",
                "#body": "body",
            },
            ExpressionAttributeValues={
                ":title": title,
                ":tags": tags,
                ":body": paragraphs,
            },
            ConditionExpression="attribute_exists(PK)",
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(404, {"error": "Post not found"})
        raise
    item = result["Attributes"]
    return response(
        200,
        {
            "slug": item["slug"],
            "title": item["title"],
            "tags": item.get("tags", []),
            "body": item["body"],
            "publishedAt": item["publishedAt"],
            "comments": comments_for(slug),
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


def delete_post(slug):
    partition_key = f"POST#{slug}"
    result = table.query(KeyConditionExpression=Key("PK").eq(partition_key))
    items = result.get("Items", [])
    while "LastEvaluatedKey" in result:
        result = table.query(
            KeyConditionExpression=Key("PK").eq(partition_key),
            ExclusiveStartKey=result["LastEvaluatedKey"],
        )
        items.extend(result.get("Items", []))
    if not any(item["SK"] == "POST" for item in items):
        return response(404, {"error": "Post not found"})
    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
    return response(200, {"deleted": slug})


def delete_comment(slug, comment_id):
    partition_key = f"POST#{slug}"
    result = table.query(
        KeyConditionExpression=Key("PK").eq(partition_key)
        & Key("SK").begins_with("COMMENT#")
    )
    comments = result.get("Items", [])
    while "LastEvaluatedKey" in result:
        result = table.query(
            KeyConditionExpression=Key("PK").eq(partition_key)
            & Key("SK").begins_with("COMMENT#"),
            ExclusiveStartKey=result["LastEvaluatedKey"],
        )
        comments.extend(result.get("Items", []))
    comment = next((item for item in comments if item.get("id") == comment_id), None)
    if not comment:
        return response(404, {"error": "Comment not found"})
    table.delete_item(Key={"PK": comment["PK"], "SK": comment["SK"]})
    return response(200, {"deleted": comment_id})


def lambda_handler(event, context):
    del context
    method = event.get("requestContext", {}).get("http", {}).get("method")
    path = event.get("rawPath", "")
    parameters = event.get("pathParameters", {})
    try:
        if method == "GET" and path == "/posts":
            return list_posts()
        if method == "POST" and path == "/posts":
            return create_post(event)
        if method == "POST" and path.endswith("/comments"):
            slug = event.get("pathParameters", {}).get("slug", "")
            return create_comment(event, slug)
        if method == "PUT" and path.startswith("/posts/"):
            return update_post(event, parameters.get("slug", ""))
        if method == "DELETE" and parameters.get("commentId"):
            return delete_comment(parameters.get("slug", ""), parameters.get("commentId", ""))
        if method == "DELETE" and path.startswith("/posts/"):
            return delete_post(parameters.get("slug", ""))
        return response(404, {"error": "Not found"})
    except (TypeError, ValueError) as error:
        return response(400, {"error": str(error)})
    except Exception:
        logger.exception("Posts request failed")
        return response(500, {"error": "Internal server error"})
