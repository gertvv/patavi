slow <- function(params) {
  N <- 100;
  x <- abs(rnorm(N, 0.001, 0.05))
  print(paste("printing from slow"))
  silent <- as.list(params)[['silent']]
  for(i in as.single(1:N)) {
    if (is.null(silent) || !silent) {
      self.oobSend(list(progress=i))
    }
    Sys.sleep(x[[i]])
  }

  save.plot(function() hist(x), "duration", type="png")

  params
}
