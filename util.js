exports.asBuffer = function(data) {
  return new Buffer(JSON.stringify(data));
}
