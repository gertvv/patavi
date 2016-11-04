FROM phusion/baseimage

ENV LANG C.UTF-8
ENV LC_ALL C.UTF-8

ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update
RUN apt-get upgrade -y

# Install R and required R packages
RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E084DAB9
RUN echo 'deb http://cran.rstudio.com/bin/linux/ubuntu trusty/' > /etc/apt/sources.list.d/cran.list
RUN apt-get update
RUN apt-get install -y -q r-base-dev
RUN apt-get install -y -q libxt-dev libcairo2-dev
RUN R -e 'install.packages("Rserve", repos="http://cran.rstudio.com/"); if (!require("Rserve")) quit(save="no", status=8)'
RUN R -e 'install.packages("RJSONIO", repos="http://cran.rstudio.com/"); if (!require("RJSONIO")) quit(save="no", status=8)'
RUN R -e 'install.packages("Cairo", repos="http://cran.rstudio.com/"); if (!require("Cairo")) quit(save="no", status=8)'
RUN R -e 'install.packages("base64enc", repos="http://cran.rstudio.com/"); if (!require("base64enc")) quit(save="no", status=8)'

# Install JRE
RUN add-apt-repository ppa:openjdk-r/ppa 
RUN apt-get update
RUN apt-get install -y -q openjdk-7-jre-headless

RUN apt-get install -y -q unzip

# create patavi user
RUN useradd --create-home --home /var/lib/patavi patavi

USER patavi
WORKDIR /var/lib/patavi
RUN mkdir bin
ENV PATH /var/lib/patavi/bin:$PATH

RUN mkdir log
ENV RSERVE_LOGS=log/rserve.log

ADD patavi.worker-0.3-standalone.jar .

ENV PATAVI_BROKER_HOST=rabbit

RUN echo '#!/bin/bash\njava -jar patavi.worker-0.3-standalone.jar "$@"' > bin/patavi-worker
RUN chmod +x bin/patavi-worker
