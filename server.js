import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler, serveStatic } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'

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
    const message = {
      id: this.messages.length,
      text: JSON.stringify(await query(data.text))
    }

    // Add new message to the list
    //this.messages.push(message)
    this.messages = [ message ];

    return this.messages
  }
}

// Creates an KoaJS compatible Feathers application
const app = koa(feathers())

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
})

// Add any new real-time connection to the `everybody` channel
app.on('connection', (connection) => app.channel('everybody').join(connection))
// Publish all events to the `everybody` channel
app.publish((_data) => app.channel('everybody'))

// Start the server
app.listen(3031).then(() => console.log('Feathers server listening on localhost:3031'))
