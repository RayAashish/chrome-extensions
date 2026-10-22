import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  cleanCodeText,
  stripRawTextLineNumbers,
  extractCleanElementText,
  findNearestHeading,
  extractPageCode
} from '../src/content/extractor';

describe('Extractor Module', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><head><title>Spring Kafka Tutorial</title></head><body></body></html>', {
      url: 'https://example.com/tutorials/spring-kafka'
    });
    // @ts-ignore
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    // @ts-ignore
    globalThis.document = dom.window.document;
  });

  it('strips plain-text line numbers with pipe gutters', () => {
    const raw = `1 | package com.example;
2 | public class Test {
3 |   private int count;
4 | }`;
    const cleaned = stripRawTextLineNumbers(raw);
    expect(cleaned).toBe(`package com.example;\npublic class Test {\n  private int count;\n}`);
  });

  it('strips plain-text line numbers with colon gutters', () => {
    const raw = `01: server:
02:   port: 8080
03:   ssl:
04:     enabled: true`;
    const cleaned = stripRawTextLineNumbers(raw);
    expect(cleaned).toBe(`server:\n  port: 8080\n  ssl:\n    enabled: true`);
  });

  it('cleans zero-width characters and trims blank lines while preserving indentation', () => {
    const raw = `\n\n\u200B  spring.kafka.bootstrap-servers=localhost:9092\n    group-id=demo\n\n`;
    const cleaned = cleanCodeText(raw);
    expect(cleaned).toBe(`  spring.kafka.bootstrap-servers=localhost:9092\n    group-id=demo`);
  });

  it('strips Prism.js .line-numbers-rows and copy buttons from element', () => {
    document.body.innerHTML = `
      <pre class="line-numbers">
        <code>
          <button class="copy-button">Copy</button>
          <span>console.log('hello');</span>
          <span class="line-numbers-rows"><span></span></span>
        </code>
      </pre>
    `;
    const pre = document.querySelector('pre')!;
    const extracted = extractCleanElementText(pre);
    expect(extracted.includes('Copy')).toBe(false);
    expect(extracted.trim()).toBe("console.log('hello');");
  });

  it('extracts Baeldung SyntaxHighlighter code ignoring td.gutter', () => {
    document.body.innerHTML = `
      <div class="syntaxhighlighter">
        <table>
          <tbody>
            <tr>
              <td class="gutter"><div class="line number1">1</div><div class="line number2">2</div></td>
              <td class="code"><div class="container"><div class="line">spring.kafka.bootstrap-servers=localhost:9092</div></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const container = document.querySelector('.syntaxhighlighter')!;
    const extracted = extractCleanElementText(container);
    expect(extracted).not.toContain('1');
    expect(extracted).toContain('spring.kafka.bootstrap-servers=localhost:9092');
  });

  it('traverses upward to find nearest preceding heading', () => {
    document.body.innerHTML = `
      <h2>1. Kafka Broker Setup</h2>
      <p>Some historical explanation of Kafka architecture...</p>
      <pre><code>$ docker run -d apache/kafka:latest</code></pre>

      <h3>2. Configuring Spring Boot</h3>
      <p>Now configure application.yml properties:</p>
      <pre><code>spring:\n  kafka:\n    bootstrap-servers: localhost:9092</code></pre>
    `;
    const pres = document.querySelectorAll('pre');
    expect(findNearestHeading(pres[0])).toBe('1. Kafka Broker Setup');
    expect(findNearestHeading(pres[1])).toBe('2. Configuring Spring Boot');
  });

  it('performs end-to-end extraction on target prompt scenario', () => {
    document.body.innerHTML = `
      <h1>Building Event-Driven Systems with Spring Boot and Kafka</h1>
      <p>Paragraph 1 about the history of event streaming...</p>
      <p>Paragraph 2...</p>

      <h3>1. Adding Maven Dependencies</h3>
      <pre><code>&lt;dependency&gt;
    &lt;groupId&gt;org.springframework.kafka&lt;/groupId&gt;
    &lt;artifactId&gt;spring-kafka&lt;/artifactId&gt;
&lt;/dependency&gt;</code></pre>

      <p>3 paragraphs explaining what a broker is...</p>

      <h3>2. Configuring Spring Boot</h3>
      <pre><code>spring:
  kafka:
    bootstrap-servers: localhost:9092</code></pre>

      <h3>3. Creating the Producer</h3>
      <pre><code>package com.example.kafka;

import org.springframework.context.annotation.Configuration;

@Configuration
public class KafkaProducerConfig {
    // Producer config logic
}</code></pre>
    `;

    const result = extractPageCode();

    expect(result.pageTitle).toBe('Spring Kafka Tutorial');
    expect(result.snippets.length).toBe(3);

    // Step 1: Maven
    expect(result.snippets[0].category).toBe('dependency');
    expect(result.snippets[0].suggestedPath).toBe('pom.xml');
    expect(result.snippets[0].language).toBe('xml');

    // Step 2: Spring YAML
    expect(result.snippets[1].category).toBe('configuration');
    expect(result.snippets[1].suggestedPath).toBe('src/main/resources/application.yml');
    expect(result.snippets[1].language).toBe('yaml');

    // Step 3: Java Class
    expect(result.snippets[2].category).toBe('source');
    expect(result.snippets[2].suggestedPath).toBe('src/main/java/com/example/kafka/KafkaProducerConfig.java');
    expect(result.snippets[2].language).toBe('java');
  });

  it('correctly extracts Confluent Gatsby docs with inline code path hints', () => {
    document.body.innerHTML = `
      <h2>Build Producer</h2>
      <p>Create the Kafka Producer. Paste the following Java code into a file located at <code class="language-text">src/main/java/examples/Producer.java</code>.</p>
      <div class="gatsby-highlight" data-language="java">
        <pre class="language-java"><code class="language-java">package examples;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class Producer {
    private static final Logger logger = LoggerFactory.getLogger(Producer.class);
}</code></pre>
      </div>
    `;

    const result = extractPageCode();
    expect(result.snippets.length).toBe(1);
    expect(result.snippets[0].category).toBe('source');
    expect(result.snippets[0].suggestedPath).toBe('src/main/java/examples/Producer.java');
    expect(result.snippets[0].language).toBe('java');
    expect(result.snippets[0].contextHeading).toBe('Build Producer');
  });

  it('extracts MDN Web Docs code blocks with .code-example, .language-name, and brush: js', () => {
    document.body.innerHTML = `
      <section class="content-section" aria-labelledby="defining_classes">
        <h3 id="defining_classes" class="heading"><a class="heading-anchor" href="#defining_classes">Defining classes</a></h3>
        <p>Classes are in fact "special <a href="/en-US/docs/Web/JavaScript/Reference/Functions">functions</a>", and just as you can define function expressions...</p>
        <div class="code-example">
          <div class="example-header">
            <span class="language-name">js</span>
            <button type="button" class="copy-icon">Copy</button>
          </div>
          <pre class="brush: js notranslate"><code>// Declaration
class Rectangle {
  constructor(height, width) {
    this.height = height;
    this.width = width;
  }
}</code></pre>
        </div>
      </section>
    `;

    const result = extractPageCode();
    expect(result.snippets.length).toBe(1);
    expect(result.snippets[0].category).toBe('source');
    expect(result.snippets[0].language).toBe('javascript');
    expect(result.snippets[0].contextHeading).toBe('Defining classes');
    expect(result.snippets[0].suggestedPath).toBe('Rectangle.js');
    expect(result.snippets[0].rawCode).toContain('class Rectangle');
    expect(result.snippets[0].rawCode).not.toContain('Copy');
  });

  it('extracts Confluent Java code fragment with generics and correctly classifies as Java', () => {
    document.body.innerHTML = `
      <h2>Kafka Producers: Writing Data Into Your Event Pipeline</h2>
      <p>Here's a snippet of example code:</p>
      <pre><code>Properties config = loadProperties("kafka.properties");
Producer&lt;Long, String&gt; producer = new KafkaProducer&lt;&gt;(config);

ThermostatReading reading = new ThermostatReading("kitchen", 32, Temperature.celcius(22));
String readingAsJson = objectMapper.writeValueAsString(reading);
ProducerRecord record = new ProducerRecord&lt;&gt;("thermostat_readings", 32, readingAsJson);
producer.send(record);</code></pre>
    `;

    const result = extractPageCode();
    expect(result.snippets.length).toBe(1);
    expect(result.snippets[0].category).toBe('source');
    expect(result.snippets[0].language).toBe('java');
    expect(result.snippets[0].suggestedPath).toBe('src/main/java/kafka-producers-writing-data-into-your-event-pipeline.java');
  });

  it('extracts code encapsulated inside Shadow DOM (MDN <mdn-code-example>) and traverses to light DOM heading', () => {
    document.body.innerHTML = `
      <section class="content-section" aria-labelledby="strict_equality">
        <h3 id="strict_equality" class="heading"><a href="#strict_equality">Strict equality and undefined</a></h3>
        <p>You can use undefined and the strict equality and inequality operators...</p>
        <mdn-code-example class="brush: js notranslate" id="custom-mdn-el"></mdn-code-example>
      </section>
    `;

    const host = document.getElementById('custom-mdn-el')!;
    const shadow = host.attachShadow({ mode: 'open' });
    const div = document.createElement('div');
    div.className = 'code-example';
    const pre = document.createElement('pre');
    pre.className = 'brush: js notranslate';
    pre.innerHTML = '<code>let x;\nif (x === undefined) {\n  console.log("x is undefined");\n}</code>';
    div.appendChild(pre);
    shadow.appendChild(div);

    const result = extractPageCode();
    expect(result.snippets.length).toBe(1);
    expect(result.snippets[0].category).toBe('source');
    expect(result.snippets[0].language).toBe('javascript');
    expect(result.snippets[0].contextHeading).toBe('Strict equality and undefined');
    expect(result.snippets[0].suggestedPath).toBe('strict-equality-and-undefined.js');
    expect(result.snippets[0].rawCode).toContain('x === undefined');
  });

  it('handles multiple custom elements with Shadow DOM across different sections', () => {
    document.body.innerHTML = `
      <h2>1. Class Declaration</h2>
      <mdn-code-example class="brush: js notranslate" id="mdn-1"></mdn-code-example>
      <h2>2. Class Expression</h2>
      <mdn-code-example class="brush: js notranslate" id="mdn-2"></mdn-code-example>
    `;

    const host1 = document.getElementById('mdn-1')!;
    const shadow1 = host1.attachShadow({ mode: 'open' });
    const pre1 = document.createElement('pre');
    pre1.textContent = 'class Rectangle {\n  constructor(h, w) { this.h = h; }\n}';
    shadow1.appendChild(pre1);

    const host2 = document.getElementById('mdn-2')!;
    const shadow2 = host2.attachShadow({ mode: 'open' });
    const pre2 = document.createElement('pre');
    pre2.textContent = 'const Polygon = class {\n  constructor(sides) { this.sides = sides; }\n};';
    shadow2.appendChild(pre2);

    const result = extractPageCode();
    expect(result.snippets.length).toBe(2);
    expect(result.snippets[0].contextHeading).toBe('1. Class Declaration');
    expect(result.snippets[0].language).toBe('javascript');
    expect(result.snippets[1].contextHeading).toBe('2. Class Expression');
    expect(result.snippets[1].language).toBe('javascript');
  });

  it('strips accidental markdown code fences from snippet text', () => {
    const raw = '```javascript\nconst a = 1;\nconst b = 2;\n```';
    const cleaned = cleanCodeText(raw);
    expect(cleaned).toBe('const a = 1;\nconst b = 2;');
  });
});
