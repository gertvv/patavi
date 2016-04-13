slow <- function(params) {
  N <- 100;
  x <- abs(rnorm(N, 0.001, 0.05))
  print(paste("printing from slow"))
  silent <- as.list(params)[['silent']]
  fail <- as.list(params)[['fail']]
  for(i in as.single(1:N)) {
    if (is.null(silent) || !silent) {
      update(list(progress=i))
    }
    Sys.sleep(x[[i]])
  }

  if (!is.null(fail)) { stop("Failure requested") }

  save.plot(function() hist(x), "duration", type="png")

  params
}
