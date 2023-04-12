import * as url from 'node:url';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler, serveStatic } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import * as swg from 'feathers-swagger';

const swagger = swg.default;

import { query } from './query.js';

class MessageService {
  messages = []

  async find() {
    // Just return all our messages
    return this.messages
  }

  async create(data) {
    // The new message is the data text with a unique identifier added
    // using the messages length since it changes whenever we add one
    if (data.text) console.log(`Querying ${data.table} for "${data.text}"`);
    const message = {
      id: this.messages.length,
      text: JSON.stringify(await query(data.text, data.table))
    }

    // Add new message to a new list
    this.messages = [ message ];

    return this.messages
  }
}

// Creates an KoaJS compatible Feathers application
const app = koa(feathers())
  .configure(swagger({
    specs: {
      info: {
        title: 'Vector-Victor API test',
        description: 'A simple API with websocket support for querying NL documentation vectors',
        version: '1.0.0',
      },
      components: { schemas: { messages: {}, messagesList: {} } },
    },
    ui: swagger.swaggerUI({ docsPath: '/docs', docsJsonPath: '/openapi.json' }),
  }))

// Use the current folder for static file hosting
app.use(serveStatic('./'))
// Register the error handle
app.use(errorHandler())
// Parse JSON request bodies
app.use(bodyParser())

// Register REST service handler
app.configure(rest())
// Configure Socket.io real-time APIs
app.configure(socketio())
// Register our messages service
app.use('messages', new MessageService())

app.service('messages').on('created', (message) => {
  console.log('A new message has been created', message)
});

// Add any new real-time connection to the `everybody` channel
app.on('connection', (connection) => app.channel('everybody').join(connection))
// Publish all events to the `everybody` channel
app.publish((_data) => app.channel('everybody'))

// Start the server
app.listen(3031).then(() => console.log('Vector-Victor server listening on http://localhost:3031'))
