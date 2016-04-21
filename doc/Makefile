images := $(patsubst %.dot,%.png,$(wildcard *.dot))

all: $(images)

.PHONY: all

%.png: %.dot
	dot -Tpng $< > $@
