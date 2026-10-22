import { describe, it, expect } from 'vitest';
import { classifySnippet, extractFilenameHint, slugify } from '../src/core/classifier';

describe('Classifier Module', () => {
  it('correctly slugifies headings', () => {
    expect(slugify('3. Creating the Producer')).toBe('3-creating-the-producer');
    expect(slugify('2. Configuring Spring Boot!')).toBe('2-configuring-spring-boot');
  });

  it('extracts explicit filename hints from heading or comments', () => {
    expect(extractFilenameHint('Listing 1: KafkaProducerConfig.java', '')).toBe('KafkaProducerConfig.java');
    expect(extractFilenameHint('File: src/main/resources/application.yml', '')).toBe('src/main/resources/application.yml');
    expect(extractFilenameHint('', '// filename: src/components/Header.tsx\nconst x = 1;')).toBe('src/components/Header.tsx');
  });

  it('classifies Maven dependency snippet', () => {
    const mavenCode = `<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>`;
    const result = classifySnippet(mavenCode, '1. Adding Maven Dependencies');
    expect(result.category).toBe('dependency');
    expect(result.language).toBe('xml');
    expect(result.suggestedPath).toBe('pom.xml');
  });

  it('classifies Spring Boot YAML config snippet', () => {
    const yamlCode = `spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer`;
    const result = classifySnippet(yamlCode, '2. Configuring Spring Boot');
    expect(result.category).toBe('configuration');
    expect(result.language).toBe('yaml');
    expect(result.suggestedPath).toBe('src/main/resources/application.yml');
  });

  it('classifies Java class with package mapping', () => {
    const javaCode = `package com.example.demo.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class KafkaProducerConfig {
    // producer configuration beans
}`;
    const result = classifySnippet(javaCode, '3. Creating the Producer');
    expect(result.category).toBe('source');
    expect(result.language).toBe('java');
    expect(result.suggestedPath).toBe('src/main/java/com/example/demo/config/KafkaProducerConfig.java');
  });

  it('classifies Java test class to src/test/java', () => {
    const testCode = `package com.example.demo;

import org.junit.jupiter.api.Test;

public class KafkaProducerTest {
    @Test
    void testSend() {
    }
}`;
    const result = classifySnippet(testCode, '4. Writing the Test');
    expect(result.category).toBe('source');
    expect(result.language).toBe('java');
    expect(result.suggestedPath).toBe('src/test/java/com/example/demo/KafkaProducerTest.java');
  });

  it('classifies CLI / Terminal commands', () => {
    const cliCode = `$ docker run -d -p 9092:9092 apache/kafka:latest`;
    const result = classifySnippet(cliCode, 'Running Kafka with Docker');
    expect(result.category).toBe('command');
    expect(result.language).toBe('bash');
    expect(result.suggestedPath).toBe('scripts/commands.sh');
  });

  it('classifies Node.js package.json', () => {
    const packageJson = `{
  "name": "my-app",
  "dependencies": {
    "react": "^18.0.0"
  }
}`;
    const result = classifySnippet(packageJson);
    expect(result.category).toBe('dependency');
    expect(result.language).toBe('json');
    expect(result.suggestedPath).toBe('package.json');
  });

  it('classifies Dockerfile', () => {
    const dockerfile = `FROM openjdk:17-jdk-alpine
COPY target/*.jar app.jar
ENTRYPOINT ["java","-jar","/app.jar"]`;
    const result = classifySnippet(dockerfile);
    expect(result.category).toBe('configuration');
    expect(result.language).toBe('dockerfile');
    expect(result.suggestedPath).toBe('Dockerfile');
  });

  it('classifies ASCII directory tree', () => {
    const tree = `my-project
├── pom.xml
├── src
│   ├── main
│   │   └── java
│   └── test
└── README.md`;
    const result = classifySnippet(tree, 'Project Structure');
    expect(result.category).toBe('tree');
    expect(result.suggestedPath).toBe('project-structure.txt');
  });

  it('classifies Baeldung JUnit 5 test class from real-world tutorial', () => {
    const baeldungCode = `@TestMethodOrder(MethodOrderer.Random.class)
public class RandomOrderUnitTest {

    private static StringBuilder output = new StringBuilder("");

    @Test
    void myATest() {
        output.append("A");
    }

    @Test
    void myBTest() {
        output.append("B");
    }
}`;
    const result = classifySnippet(baeldungCode, '2.3. Using Random Order');
    expect(result.category).toBe('source');
    expect(result.language).toBe('java');
    expect(result.suggestedPath).toBe('src/test/java/RandomOrderUnitTest.java');
  });

  it('classifies Confluent Kafka Producer code fragment as Java without public class declaration', () => {
    const kafkaCode = `Properties config = loadProperties("kafka.properties");
Producer<Long, String> producer = new KafkaProducer<>(config);

ThermostatReading reading = new ThermostatReading("kitchen", 32, Temperature.celcius(22));
String readingAsJson = objectMapper.writeValueAsString(reading);
ProducerRecord record = new ProducerRecord<>("thermostat_readings", 32, readingAsJson);
producer.send(record);`;
    const result = classifySnippet(kafkaCode, 'Kafka Producers: Writing Data Into Your Event Pipeline');
    expect(result.category).toBe('source');
    expect(result.language).toBe('java');
    expect(result.suggestedPath).toBe('src/main/java/kafka-producers-writing-data-into-your-event-pipeline.java');
  });

  it('classifies MDN JavaScript class declaration as JavaScript and not Java', () => {
    const mdnCode = `// Declaration
class Rectangle {
  constructor(height, width) {
    this.height = height;
    this.width = width;
  }
}

// Expression; the class is anonymous but assigned to a variable
const Rectangle = class {
  constructor(height, width) {
    this.height = height;
    this.width = width;
  }
};`;
    const result = classifySnippet(mdnCode, 'Defining classes');
    expect(result.category).toBe('source');
    expect(result.language).toBe('javascript');
    expect(result.suggestedPath).toBe('Rectangle.js');
  });
});
