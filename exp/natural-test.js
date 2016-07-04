var natural = require('natural'),
  classifierObj = new natural.BayesClassifier();

var classifiers = [
  {
    classifier: 'command',
    data: [{
      intent: 'follow_twitter',
      description: 'follow on twitter',
      trainingData: [
        'start following @twitteruser',
        'stop following @twitteruser',
        'follow @twitteruser',
        'don\'t follow @twitteruser'
      ]
    },
    {
      intent: 'listen_irc',
      description: 'listen to user or channel',
      trainingData: [
        'start listening to location',
        'stop listening to location',
        'listen to location',
        'don\'t listen to location'
      ]
    }]
  },
  {
    classifier: 'on_off',
    data: [{
      intent: 'on',
      description: 'on',
      trainingData: [
        'start',
        'start listening to',
        'listen to',
        'follow',
        'on'
      ]
    },
    {
      intent: 'off',
      description: 'off',
      trainingData: [
        'stop',
        'stop listening to',
        'stop following',
        'don\'t follow',
        'off'
      ]
    }]
  },
  {
    classifier: 'yes_no',
    data: [{
      intent: 'yes',
      description: 'yes',
      trainingData: [
        'yes',
        'yep',
        'yah',
        'ya',
        'ok'
      ]
    },
    {
      intent: 'no',
      description: 'no',
      trainingData: [
        'no',
        'nope',
        'nah'
      ]
    }]
  },
];

// Train classifiers
for (var i = 0, len = classifiers.length; i < len; i++) {
  var classifier = classifiers[i];

  console.log('Training classifier: ', classifier.classifier);

  classifier.bayesClassifier = new natural.BayesClassifier();

  for (var j = 0, len2 = classifier.data.length; j < len2; j++) {
    var intent = classifier.data[j];

    console.log('Training intent: ' + classifier.classifier + '/' + intent.intent);

    for (var k = 0, len3 = intent.trainingData.length; k < len3; k++) {
      var document = intent.trainingData[k];

      console.log('Training data: ' + classifier.classifier + '/' + intent.intent + '/' + document);

      classifier.bayesClassifier.addDocument(document, intent.intent);
    }
  }

  classifier.bayesClassifier.train();
}

var findIntents = function(string) {
  var results = [];

  for (var i = 0, len = classifiers.length; i < len; i++) {
    var classifier = classifiers[i];

    var classifierResult = classifier.bayesClassifier.getClassifications(string);

    var result = {
      classifier: classifier.classifier
    };

    for (var j = 0, len2 = classifierResult.length; j < len2; j++) {
      var classification = classifierResult[j];

      if (!result.value || classification.value > result.value) {
        result.intent = [classification.label];
        result.value = classification.value;
      } else if (classification.value === result.value) {
        result.intent.push(classification.label);
      }
    }


    results.push(result);
  }

  return results;
}

console.log(findIntents('please start following the twitter user @elonmusk'));

console.log(findIntents('i need you to stop following the twitter user @exastris'));

console.log(findIntents('stop listening to EchoLogic'));

console.log(findIntents('listen to randomname'));

console.log(findIntents('listen follow'));

/**
classifierObj.addDocument(['stop following twitteruser', 'start following twitteruser', 'follow twitteruser'], 'follow_twitter');
classifierObj.addDocument(['start listening to channel', 'stop listening to channel','listen to channel'], 'listen_channel');

classifierObj.train();

console.log(classifierObj.classify('please start following the twitter user @elonmusk'));

console.log(classifierObj.classify('i need you to stop following the twitter user @exastris'));

console.log(classifierObj.classify('stop listening to EchoLogic'));
**/
