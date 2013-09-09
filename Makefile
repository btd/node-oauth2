
MOCHA_OPTS= ./test
REPORTER = spec

clean:

start: clean
	@NODE_ENV=development ./node_modules/.bin/nodemon --watch app index.js

start-prod: clean
	@NODE_ENV=production ./node_modules/.bin/nodemon --watch app index.js

test: test-unit

test-jenkins-xunit:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--recursive \
		--check-leaks \
		--reporter xunit \
		$(MOCHA_OPTS)

test-jenkins-cov:
	@NODE_ENV=test ./node_modules/.bin/istanbul cover --report cobertura --dir ./results ./node_modules/.bin/_mocha -- \
		--recursive \
		--check-leaks \
		--reporter $(REPORTER) \
		$(MOCHA_OPTS)

test-unit:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--recursive \
		--check-leaks \
		--reporter $(REPORTER) \
		$(MOCHA_OPTS)

test-cov:
	@NODE_ENV=test ./node_modules/.bin/istanbul cover ./node_modules/.bin/_mocha -- \
		--recursive \
		--check-leaks \
		--reporter $(REPORTER) \
		$(MOCHA_OPTS)


lint:
	./node_modules/.bin/jshint --show-non-errors app

results:
	mkdir ./results

jshint-jenkins: results
	./node_modules/.bin/jshint --reporter=checkstyle app 1> results/checkstyle.xml || exit 0

install:
	npm install

