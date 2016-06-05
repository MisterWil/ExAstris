var merge = require('merge');

var a = {
    a : "a",
    b : "a"
};

var b = {
    b : "b",
    c : "b"
};

var c = merge(true, b, a);

console.log(a);
console.log(b);
console.log(c);