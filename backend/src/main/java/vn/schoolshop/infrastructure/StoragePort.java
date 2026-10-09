package vn.schoolshop.infrastructure;
public interface StoragePort {
    void upload(String bucket,String path,byte[] content,String mime);
    void delete(String bucket,String path);
    String signed(String bucket,String path,int seconds);
    String publicUrl(String bucket,String path);
}
