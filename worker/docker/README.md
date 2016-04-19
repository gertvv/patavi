Patavi worker dockerfile
========================

Build the base image:

```
docker build --build-arg sha=446a38c -t patavi/worker-amqp .
```

Build the example worker:

```
docker build -t patavi/worker-amqp-slow -f Dockerfile.slow .
```

Run the example worker:

```
docker run -d --link <rabbitmq-container-name>:rabbit --name amqp-slow patavi/worker-amqp-slow
```
