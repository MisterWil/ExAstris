var natural = require('natural'),
    tokenizer = new natural.TreebankWordTokenizer(),
    nounInflector = new natural.NounInflector();

console.log(tokenizer.tokenize("my dog hasn't any fleas."));

natural.PorterStemmer.attach();
console.log("i am waking up to the sounds of chainsaws".tokenizeAndStem());
console.log("chainsaws".stem());

nounInflector.attach();
console.log('radius'.pluralizeNoun());
console.log('beers'.singularizeNoun());