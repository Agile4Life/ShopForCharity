package vn.schoolshop.infrastructure;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import vn.schoolshop.common.ApiException;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.security.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
@Component
public class Crypto {
    private final byte[] encryptionKey,signingKey;
    private final SecureRandom random=new SecureRandom();
    private final Base64.Encoder encoder=Base64.getUrlEncoder().withoutPadding();
    public Crypto(@Value("${app.encryption-key}") String encryption,@Value("${app.signing-key}") String signing) {
        encryptionKey=Base64.getDecoder().decode(encryption);signingKey=Base64.getDecoder().decode(signing);
        if(encryptionKey.length!=32||signingKey.length!=32||MessageDigest.isEqual(encryptionKey,signingKey)) throw new IllegalArgumentException("Configure independent base64 32-byte encryption/signing keys");
    }
    public String token() {byte[] data=new byte[32];random.nextBytes(data);return encoder.encodeToString(data);}
    public static String hash(String text) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private byte[] mac(String text) {try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(signingKey,"HmacSHA256"));return mac.doFinal(text.getBytes(StandardCharsets.UTF_8));}catch(Exception e){throw new IllegalStateException(e);}}
    public String sign(String payload) {String data=encoder.encodeToString(payload.getBytes(StandardCharsets.UTF_8));return data+"."+encoder.encodeToString(mac(data));}
    public String verify(String token) {
        try {var parts=token.split("\\.",-1);if(parts.length!=2||!MessageDigest.isEqual(mac(parts[0]),Base64.getUrlDecoder().decode(parts[1])))throw new IllegalArgumentException();return new String(Base64.getUrlDecoder().decode(parts[0]),StandardCharsets.UTF_8);}
        catch(Exception e){throw new ApiException(401,"INVALID_SESSION","Phiên truy cập không hợp lệ.");}
    }
    public String encrypt(String text) {try{
        byte[] nonce=new byte[12];random.nextBytes(nonce);var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,nonce));
        var encrypted=cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));var combined=new byte[nonce.length+encrypted.length];System.arraycopy(nonce,0,combined,0,12);System.arraycopy(encrypted,0,combined,12,encrypted.length);return encoder.encodeToString(combined);
    }catch(Exception e){throw new IllegalStateException(e);}}
    public String decrypt(String text) {try{var data=Base64.getUrlDecoder().decode(text);var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,Arrays.copyOf(data,12)));return new String(cipher.doFinal(Arrays.copyOfRange(data,12,data.length)),StandardCharsets.UTF_8);}catch(Exception e){throw new IllegalStateException("Cannot decrypt idempotency record");}}
}
