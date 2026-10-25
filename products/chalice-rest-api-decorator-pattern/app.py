from chalice import Chalice, IAMAuthorizer, Response

app = Chalice(app_name="decorated-api")

@app.route("/resources/{resource_id}", methods=["GET"], authorizer=IAMAuthorizer(), cors=False)
def get_resource(resource_id):
    if not resource_id or len(resource_id) > 128:
        return Response(body={"error": "invalid resource id"}, status_code=400)
    return {"resource_id": resource_id}
