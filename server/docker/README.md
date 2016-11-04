

Patavi server dockerfile
========================

Prerequisites:

 - Create an `ssl` directory, containing:

   - `ssl/server-crt.pem` and `ssl/server-key.pem`, the public/private certificate/key pair for the server
   - `ssl/ca-crt.pem`, the CA certificate for the server to trust client connections with

Building:

```
docker build -t patavi/server-amqp --build-arg sha=`git rev-parse --short HEAD` .
```

Running:

```
docker run -d --name patavi-server-amqp \
  --link <rabbitmq-container-name>:rabbit -e PATAVI_BROKER_HOST=<user>:<pass>@rabbit \
  -p 3000:3000 -e PATAVI_SELF=//localhost:3000 -e PATAVI_PORT=3000 \
  -e PATAVI_DB_HOST=<db-host> -e PATAVI_DB_NAME=<db-name> -e PATAVI_DB_USER=<db-user> -e PATAVI_DB_PASSWORD=<db-pass> \
  patavi/server-amqp
```
