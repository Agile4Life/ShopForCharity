FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
RUN ./mvnw -B -ntp dependency:go-offline
COPY src/ src/
# Unit/DB checks run separately before release. Docker build compiles/packages only.
RUN ./mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=build --chown=app:app /build/target/backend-0.1.0.jar app.jar
USER 10001:10001
ENV PORT=8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -Djava.awt.headless=true"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
