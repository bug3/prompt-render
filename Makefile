.PHONY: install build test test-watch typecheck lint clean

install:
	npm install

build:
	npm run build

test:
	npm run test

test-watch:
	npm run test:watch

typecheck:
	npm run typecheck

lint:
	npm run lint

clean:
	rm -rf dist node_modules
