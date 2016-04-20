Patavi worker dockerfile
========================

First, build the worker uberjar (from the `worker` directory):

```
lein uberjar
cp target/patavi.worker-0.3-standalone.jar docker/
```

Then, build the base image:

```
docker build -t patavi/worker-amqp .
```

Build the example worker:

```
docker build -t patavi/worker-amqp-slow -f Dockerfile.slow .
```

Run the example worker:

```
docker run -d --link <rabbitmq-container-name>:rabbit \
  -e PATAVI_BROKER_USER=<user> -e PATAVI_BROKER_PASSWORD=<pass> \
  --name amqp-slow patavi/worker-amqp-slow
```
