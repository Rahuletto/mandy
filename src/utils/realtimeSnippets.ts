import type { Language } from "../components/CodeMirror";
import type { MQTTFile, SocketIOFile } from "../types/project";

export type SocketIOSnippetLang =
  | "JavaScript"
  | "Python"
  | "Go"
  | "Rust"
  | "Java"
  | "PHP";

export type MqttSnippetLang =
  | "JavaScript"
  | "Python"
  | "Go"
  | "Rust"
  | "Java"
  | "Shell mosquitto";

function escapeForDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getSocketIoUrlParts(sio: SocketIOFile) {
  return {
    url: sio.url?.trim() || "https://api.example.com",
    namespace: sio.namespace?.trim() || "/",
    path: sio.path?.trim() || "/socket.io/",
    eventName: sio.messages.find((message) => message.direction !== "system")?.event || "message",
    authPayload: sio.authPayload?.trim() || "{}",
  };
}

export function generateSocketIoSnippet(
  sio: SocketIOFile,
  lang: SocketIOSnippetLang,
): { code: string; language: Language } {
  const { url, namespace, path, eventName, authPayload } = getSocketIoUrlParts(sio);

  switch (lang) {
    case "JavaScript":
      return {
        language: "javascript",
        code: `import { io } from "socket.io-client";

const socket = io("${url}", {
  path: "${path}",
  transports: ["websocket"],
  auth: ${authPayload},
});

socket.on("connect", () => {
  console.log("connected", socket.id);
  socket.emit("${eventName}", { hello: "world" });
});

socket.onAny((event, payload) => {
  console.log(event, payload);
});`,
      };
    case "Python":
      return {
        language: "python",
        code: `import socketio

sio = socketio.Client()

@sio.event
def connect():
    print("connected")
    sio.emit("${eventName}", {"hello": "world"})

@sio.on("*")
def catch_all(event, data):
    print(event, data)

sio.connect(
    "${url}${namespace === "/" ? "" : namespace}",
    socketio_path="${path.replace(/^\//, "")}",
    auth=${authPayload}
)`,
      };
    case "Go":
      return {
        language: "go",
        code: `package main

import (
\t"fmt"
\t"github.com/zhouhui8915/go-socket.io-client"
)

func main() {
\topts := &socketio_client.Options{
\t\tTransport: "websocket",
\t\tPath: "${path}",
\t}

\tclient, err := socketio_client.NewClient("${url}${namespace === "/" ? "" : namespace}", opts)
\tif err != nil {
\t\tpanic(err)
\t}

\tclient.On("connect", func() {
\t\tfmt.Println("connected")
\t\tclient.Emit("${eventName}", map[string]string{"hello": "world"})
\t})

\tclient.On("${eventName}", func(msg interface{}) {
\t\tfmt.Printf("received: %v\\n", msg)
\t})

\tselect {}`,
      };
    case "Rust":
      return {
        language: "rust",
        code: `use rust_socketio::{ClientBuilder, Payload};
use serde_json::json;

fn main() {
    let _socket = ClientBuilder::new("${url}${namespace === "/" ? "" : namespace}")
        .path("${path}")
        .on("connect", |_, socket| {
            println!("connected");
            socket.emit("${eventName}", json!({ "hello": "world" })).ok();
        })
        .on("${eventName}", |payload, _| match payload {
            Payload::Text(values) => println!("received: {:?}", values),
            Payload::Binary(data) => println!("binary: {:?}", data),
            _ => {}
        })
        .connect()
        .expect("connection failed");
}`,
      };
    case "Java":
      return {
        language: "java",
        code: `import io.socket.client.IO;
import io.socket.client.Socket;
import org.json.JSONObject;

public class Main {
    public static void main(String[] args) throws Exception {
        IO.Options options = new IO.Options();
        options.path = "${path}";

        Socket socket = IO.socket("${url}${namespace === "/" ? "" : namespace}", options);

        socket.on(Socket.EVENT_CONNECT, args1 -> {
            System.out.println("connected");
            socket.emit("${eventName}", new JSONObject().put("hello", "world"));
        });

        socket.on("${eventName}", args12 -> System.out.println(args12[0]));
        socket.connect();
    }
}`,
      };
    case "PHP":
      return {
        language: "php",
        code: `<?php

require 'vendor/autoload.php';

use ElephantIO\\Client;
use ElephantIO\\Engine\\SocketIO\\Version4X;

$client = new Client(new Version4X('${url}', [
    'path' => '${path}',
]));

$client->initialize();
$client->emit('${eventName}', ['hello' => 'world']);
$client->close();`,
      };
  }
}

function getMqttSnippetParts(mqtt: MQTTFile) {
  const activeSubscription =
    mqtt.subscriptions.find((sub) => sub.enabled !== false && sub.topic.trim()) ||
    mqtt.subscriptions.find((sub) => sub.topic.trim());

  return {
    url: mqtt.url?.trim() || "mqtt://broker.emqx.io:1883",
    clientId: mqtt.clientId?.trim() || "mandy-client",
    cleanSession: mqtt.cleanSession !== false,
    keepAlive: mqtt.keepAliveSecs || 30,
    topic: activeSubscription?.topic?.trim() || "demo/topic",
    qos: activeSubscription?.qos ?? 0,
  };
}

export function generateMqttSnippet(
  mqtt: MQTTFile,
  lang: MqttSnippetLang,
): { code: string; language: Language } {
  const { url, clientId, cleanSession, keepAlive, topic, qos } =
    getMqttSnippetParts(mqtt);

  switch (lang) {
    case "JavaScript":
      return {
        language: "javascript",
        code: `import mqtt from "mqtt";

const client = mqtt.connect("${url}", {
  clientId: "${clientId}",
  clean: ${cleanSession},
  keepalive: ${keepAlive},
});

client.on("connect", () => {
  console.log("connected");
  client.subscribe("${topic}", { qos: ${qos} });
  client.publish("${topic}", JSON.stringify({ hello: "world" }), { qos: ${qos} });
});

client.on("message", (topic, payload) => {
  console.log(topic, payload.toString());
});`,
      };
    case "Python":
      return {
        language: "python",
        code: `import paho.mqtt.client as mqtt

client = mqtt.Client(client_id="${clientId}", clean_session=${cleanSession ? "True" : "False"})

def on_connect(client, userdata, flags, rc):
    print("connected", rc)
    client.subscribe("${topic}", qos=${qos})
    client.publish("${topic}", '{"hello":"world"}', qos=${qos})

def on_message(client, userdata, msg):
    print(msg.topic, msg.payload.decode())

client.on_connect = on_connect
client.on_message = on_message
client.connect("${url.replace(/^mqtts?:\/\//, "").replace(/:\d+.*$/, "")}", ${Number(url.match(/:(\d+)/)?.[1] || 1883)}, ${keepAlive})
client.loop_forever()`,
      };
    case "Go":
      return {
        language: "go",
        code: `package main

import (
\t"fmt"
\tMQTT "github.com/eclipse/paho.mqtt.golang"
)

func main() {
\topts := MQTT.NewClientOptions().
\t\tAddBroker("${url}").
\t\tSetClientID("${clientId}").
\t\tSetCleanSession(${cleanSession})

\tclient := MQTT.NewClient(opts)
\tif token := client.Connect(); token.Wait() && token.Error() != nil {
\t\tpanic(token.Error())
\t}

\tclient.Subscribe("${topic}", ${qos}, func(_ MQTT.Client, msg MQTT.Message) {
\t\tfmt.Println(msg.Topic(), string(msg.Payload()))
\t})

\tclient.Publish("${topic}", ${qos}, false, []byte("{\\"hello\\":\\"world\\"}"))
\tselect {}`,
      };
    case "Rust":
      return {
        language: "rust",
        code: `use rumqttc::{Client, Event, Incoming, MqttOptions, QoS};
use std::time::Duration;

fn main() {
    let mut options = MqttOptions::new("${clientId}", "${url.replace(/^mqtts?:\/\//, "").replace(/:\d+.*$/, "")}", ${Number(url.match(/:(\d+)/)?.[1] || 1883)});
    options.set_keep_alive(Duration::from_secs(${keepAlive}));
    options.set_clean_session(${cleanSession});

    let (mut client, mut connection) = Client::new(options, 10);
    client.subscribe("${topic}", QoS::AtLeastOnce).unwrap();
    client.publish("${topic}", QoS::AtLeastOnce, false, r#"{"hello":"world"}"#).unwrap();

    for event in connection.iter() {
        if let Ok(Event::Incoming(Incoming::Publish(packet))) = event {
            println!("{} {}", packet.topic, String::from_utf8_lossy(&packet.payload));
        }
    }
}`,
      };
    case "Java":
      return {
        language: "java",
        code: `import org.eclipse.paho.client.mqttv3.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MqttClient client = new MqttClient("${url}", "${clientId}");
        MqttConnectOptions options = new MqttConnectOptions();
        options.setCleanSession(${cleanSession});
        options.setKeepAliveInterval(${keepAlive});

        client.connect(options);
        client.subscribe("${topic}", ${qos});
        client.publish("${topic}", new MqttMessage("{\\"hello\\":\\"world\\"}".getBytes()));
    }
}`,
      };
    case "Shell mosquitto":
      return {
        language: "shell",
        code: `# Subscribe
mosquitto_sub -h ${url.replace(/^mqtts?:\/\//, "").replace(/:\d+.*$/, "")} -p ${Number(url.match(/:(\d+)/)?.[1] || 1883)} -t "${topic}" -q ${qos}

# Publish
mosquitto_pub -h ${url.replace(/^mqtts?:\/\//, "").replace(/:\d+.*$/, "")} -p ${Number(url.match(/:(\d+)/)?.[1] || 1883)} -t "${topic}" -q ${qos} -m '{"hello":"world"}'`,
      };
  }
}

export const SOCKETIO_SNIPPET_LANGS: {
  label: string;
  lang: SocketIOSnippetLang;
}[] = [
  { label: "JavaScript", lang: "JavaScript" },
  { label: "Python Socket.IO", lang: "Python" },
  { label: "Go Socket.IO", lang: "Go" },
  { label: "Rust Socket.IO", lang: "Rust" },
  { label: "Java Socket.IO", lang: "Java" },
  { label: "PHP Elephant.IO", lang: "PHP" },
];

export const MQTT_SNIPPET_LANGS: {
  label: string;
  lang: MqttSnippetLang;
}[] = [
  { label: "JavaScript MQTT.js", lang: "JavaScript" },
  { label: "Python Paho", lang: "Python" },
  { label: "Go Paho", lang: "Go" },
  { label: "Rust rumqttc", lang: "Rust" },
  { label: "Java Eclipse Paho", lang: "Java" },
  { label: "Shell mosquitto", lang: "Shell mosquitto" },
];
