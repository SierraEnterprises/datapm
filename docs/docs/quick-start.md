---
id: quick-start
title: Quick Start Guide
sidebar_label: Quick Start
---

DataPM helps you quickly publish and consume data. Let's start with some concepts. 

## Quick Concepts

Visit [datapm.io](https://datapm.io) to search and discover packages of data. Then use the command line client to fetch those packages, and upload your own. 

DataPM currently supports batch transfer, and will in the future support streaming transfer of data packages. 

You can also host your own private or public data registries. See the software license for allowed and prohbited use cases.


## Install the DataPM Command Line Client

If you do not already have NodeJS and NPM, install them using the following link

https://nodejs.org/en/

Verify that you have installed Node 12 or greater, and the latest npm client. 

```node -v```

```npm -v```

Install the datapm-client package globally. This allows you to run the datapm command from any working directory.

```npm install -g datapm-client```

Verify that the datapm-client package is installed

```datapm --version```


## Search DataPM Registries

You can search the public [datapm.io](https://datapm.io) registry using a modern web browser. Or use the following command to search via the command line client. 

```datapm search example```

Your search result will include packages with titles, descriptions, or keywords that match your search terms. 

## Consume Data

Use the following command to retrieve a batch data package from the datapm.io public registry. 

```datapm fetch datapm/example```

You can also fetch packages from other registries by specifying the package URL. 

```datapm fetch https://datapm-example.company.com/catalog/package```

## Publish Data

*Important Note:* Right now, DataPM only supports publishing data schemas. So you must host the actual data in another location - such as GitHub or a public webserver. And that hosting must be publically available. In the future, DataPM will also support hosting the data itself for public and private data hosting.

Use the command line client to create a data package file based on any publically avialable data set. 

```datapm generate-package https://some-web-server.com/path/to/data.csv```

Follow the prompts to complete the package file. Then use the following command to publish the package. 

```datapm publish my-package-file.datapm.json```

You can update the schema and statistics in the package file using the following command. 

```datapm update my-package-file.datapm.json```

And then you can re-publish the updates using the same publish command above. 


