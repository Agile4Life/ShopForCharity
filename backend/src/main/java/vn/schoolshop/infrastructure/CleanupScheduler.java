package vn.schoolshop.infrastructure;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CleanupScheduler {
  private final AssetService assets;

  public CleanupScheduler(AssetService assets) {
    this.assets = assets;
  }

  @Scheduled(fixedDelay = 3600000, initialDelay = 3600000)
  public void cleanup() {
    assets.cleanup();
  }
}
