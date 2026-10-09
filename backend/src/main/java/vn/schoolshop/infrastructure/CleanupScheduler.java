package vn.schoolshop.infrastructure;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
@Component
public class CleanupScheduler {
    private final AssetService assets;
    public CleanupScheduler(AssetService assets){this.assets=assets;}
    @Scheduled(fixedDelay=3600000,initialDelay=3600000) public void cleanup(){assets.cleanup();}
}
