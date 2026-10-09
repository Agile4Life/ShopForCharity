package vn.schoolshop;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }
}
