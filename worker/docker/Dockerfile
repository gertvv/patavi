FROM azul/zulu-openjdk:7u65

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

# curl & unzip
RUN apt-get install -y -q curl unzip

# create patavi user
RUN useradd --create-home --home /var/lib/patavi patavi

USER patavi
WORKDIR /var/lib/patavi
RUN mkdir bin
ENV PATH /var/lib/patavi/bin:$PATH

# download & install leiningen
RUN curl -L "https://raw.github.com/technomancy/leiningen/stable/bin/lein" -o bin/lein
RUN chmod +x bin/lein
RUN lein upgrade

ARG sha=feature/amqp

RUN curl -sL https://github.com/gertvv/patavi/archive/$sha.zip -o patavi.zip
RUN unzip patavi.zip && mv patavi-* src

RUN cd src/common && lein install
RUN cd src/worker && lein with-profile production deps

ENV PATAVI_BROKER_HOST=rabbit

RUN echo '#!/bin/bash\ncd src/worker; lein with-profile production run "$@"' > bin/patavi-worker
RUN chmod +x bin/patavi-worker
