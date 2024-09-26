package ee.forgr.capacitor.social.login;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.util.ArrayMap;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import androidx.annotation.NonNull;
import com.auth0.android.jwt.JWT;
import ee.forgr.capacitor.social.login.helpers.FunctionResult;
import ee.forgr.capacitor.social.login.helpers.FutureFunctionResult;
import ee.forgr.capacitor.social.login.helpers.PluginHelpers;
import ee.forgr.capacitor.social.login.helpers.SocialProvider;
import ee.forgr.capacitor.social.login.helpers.ThrowableFunctionResult;
import java.io.IOException;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

public class AppleProvider implements SocialProvider {

  private static String SCOPE = "name%20email";
  private static String AUTHURL = "https://appleid.apple.com/auth/authorize";
  private static String TOKENURL = "https://appleid.apple.com/auth/token";
  private static String SHARED_PREFERENCE_NAME =
    "APPLE_LOGIN_Q16ob0k_SHARED_PERF";

  private String appleAuthURLFull;
  private Dialog appledialog;

  private String idToken;
  private String refreshToken;
  private String accessToken;
  private String clientSecret;

  private final String clientId;
  private final String redirectUrl;

  public AppleProvider(String redirectUrl, String clientId) {
    this.redirectUrl = redirectUrl;
    this.clientId = clientId;
  }

  public void initialize(PluginHelpers helpers) {
    String data = helpers.getSharedPreferencePrivate(
      AppleProvider.SHARED_PREFERENCE_NAME
    );
    if (data == null || data.isEmpty()) {
      Log.i(SocialLoginPlugin.LOG_TAG, "No data to restore for apple login");
    }

    try {
      JSONObject object = new JSONObject(data);
      String idToken = object.optString("idToken", null);
      String refreshToken = object.optString("refreshToken", null);
      String accessToken = object.optString("accessToken", null);

      AppleProvider.this.idToken = idToken;
      AppleProvider.this.refreshToken = refreshToken;
      AppleProvider.this.accessToken = accessToken;
      Log.i(
        SocialLoginPlugin.LOG_TAG,
        String.format("Apple restoreState: %s", object)
      );
    } catch (JSONException e) {
      Log.e(
        SocialLoginPlugin.LOG_TAG,
        "Apple restoreState: Failed to parse JSON",
        e
      );
    }
  }

  @Override
  public FutureFunctionResult<JSONObject, String> login(
    PluginHelpers helpers,
    JSONObject config
  ) {
    FutureFunctionResult<JSONObject, String> result =
      new FutureFunctionResult();

    //        FunctionResult<Object, String> res = helpers.notifyListener("test", new ArrayMap<>());
    //        if (res.isError()) {
    //            return res.disregardSuccess();
    //        }

    String state = UUID.randomUUID().toString();
    this.appleAuthURLFull = AUTHURL +
    "?client_id=" +
    this.clientId +
    "&redirect_uri=" +
    this.redirectUrl +
    "&response_type=code&scope=" +
    SCOPE +
    "&response_mode=form_post&state=" +
    state;

    Context context = helpers.getContext();
    Activity activity = helpers.getActivity();

    if (context == null) {
      return FutureFunctionResult.error("PluginHelpers.Context is null");
    }

    if (activity == null) {
      return FutureFunctionResult.error("PluginHelpers.activity is null");
    }

    helpers.runOnUiThread(() -> {
      setupWebview(context, activity, helpers, result, appleAuthURLFull);
    });

    return result;
  }

  @Override
  public FunctionResult<Void, String> logout(PluginHelpers helpers) {
    if (this.idToken == null || this.idToken.isEmpty()) {
      return FunctionResult.error("Not logged in; Cannot logout");
    }

    helpers.removeSharedPreferencePrivate(AppleProvider.SHARED_PREFERENCE_NAME);
    AppleProvider.this.idToken = null;
    AppleProvider.this.refreshToken = null;
    AppleProvider.this.accessToken = null;

    return FunctionResult.success(null);
  }

  @Override
  public FunctionResult<String, String> getAuthorizationCode() {
    if (this.idToken != null && !this.idToken.isEmpty()) {
      return FunctionResult.success(this.idToken);
    }
    return FunctionResult.error("Apple-login not logged in!");
  }

  @Override
  public FunctionResult<Boolean, String> isLoggedIn() {
    // todo: verify that the token isn't expired
    // todo: remove this expiry code - this SHOULD be done in JS or a separate function
    if (this.idToken != null && !this.idToken.isEmpty()) {
      try {
        JWT jwt = new JWT(this.idToken);
        if (jwt.isExpired(0)) {
          Log.i(
            SocialLoginPlugin.LOG_TAG,
            "Apple - JWT expired. User is NOT logged in"
          );
          return FunctionResult.success(false);
        }
        return FunctionResult.success(true);
      } catch (Exception e) {
        return new ThrowableFunctionResult<Boolean>(
          null,
          e
        ).convertThrowableToString();
      }
    }

    return FunctionResult.success(false);
  }

  @Override
  public FunctionResult<Map<String, Object>, String> getCurrentUser() {
    return FunctionResult.error("Not implemented");
  }

  @Override
  public FunctionResult<Void, String> refresh() {
    return FunctionResult.error("Not implemented");
  }

  private class AppleWebViewClient extends WebViewClient {

    private Activity activity;
    private String clientId;
    private String redirectUrl;
    private PluginHelpers helpers;
    private FutureFunctionResult<JSONObject, String> result;

    public AppleWebViewClient(
      Activity activity,
      PluginHelpers helpers,
      FutureFunctionResult<JSONObject, String> result,
      String redirectUrl,
      String clientId
    ) {
      this.activity = activity;
      this.redirectUrl = redirectUrl;
      this.clientId = clientId;
      this.helpers = helpers;
      this.result = result;
    }

    @Override
    public boolean shouldOverrideUrlLoading(
      WebView view,
      WebResourceRequest request
    ) {
      if (request.getUrl().toString().startsWith(redirectUrl)) {
        handleUrl(request.getUrl().toString());
        // Close the dialog after getting the authorization code
        if (request.getUrl().toString().contains("success=")) {
          appledialog.dismiss();
        }
        return true;
      }
      return true;
    }

    @Override
    public void onPageFinished(WebView view, String url) {
      super.onPageFinished(view, url);

      Rect displayRectangle = new Rect();
      Window window = activity.getWindow();
      window.getDecorView().getWindowVisibleDisplayFrame(displayRectangle);

      android.view.ViewGroup.LayoutParams layoutParams = view.getLayoutParams();
      layoutParams.height = (int) (displayRectangle.height() * 0.9f);
      view.setLayoutParams(layoutParams);
    }

    private void handleUrl(String url) {
      Uri uri = Uri.parse(url);
      String success = uri.getQueryParameter("success");
      if (Objects.equals(success, "true")) {
        // handle update to access_token
        String accessToken = uri.getQueryParameter("access_token");
        if (accessToken != null) {
          String refreshToken = uri.getQueryParameter("access_token");
          String idToken = uri.getQueryParameter("id_token");

          ArrayMap<String, Object> notifyMap = new ArrayMap<>();
          notifyMap.put("provider", "apple");
          notifyMap.put("status", "success");
          try {
            persistState(idToken, refreshToken, accessToken);

            this.result.resolveSuccess(null);
          } catch (JSONException jsonException) {
            Log.e(
              SocialLoginPlugin.LOG_TAG,
              "Cannot persist state",
              jsonException
            );

            // Reject the saved PluginCall on error
            result.resolveError("Cannot persist state");
            return;
          }

          return;
        }

        // Get the Authorization Code from the URL
        String appleAuthCode = uri.getQueryParameter("code");
        Log.i("Apple Code: ", appleAuthCode);
        // Get the Client Secret from the URL
        String appleClientSecret = uri.getQueryParameter("client_secret");
        Log.i("Apple Client Secret: ", appleClientSecret);

        // Exchange the Auth Code for Access Token
        requestForAccessToken(appleAuthCode, appleClientSecret);
      } else if (Objects.equals(success, "false")) {
        Log.e("ERROR", "We couldn't get the Auth Code");

        // Reject the saved PluginCall on error
        result.resolveError("We couldn't get the Auth Code");
      }
    }

    private void requestForAccessToken(String code, String clientSecret) {
      FormBody formBody = new FormBody.Builder()
        .add("grant_type", "authorization_code")
        .add("code", code)
        .add("redirect_uri", redirectUrl)
        .add("client_id", clientId)
        .add("client_secret", clientSecret)
        .build();

      OkHttpClient client = new OkHttpClient();
      Request request = new Request.Builder()
        .url(TOKENURL)
        .post(formBody)
        .build();

      Call call = client.newCall(request);
      call.enqueue(
        new Callback() {
          @Override
          public void onFailure(@NonNull Call call, @NonNull IOException e) {
            Log.e(SocialLoginPlugin.LOG_TAG, "Cannot get access_token", e);
          }

          @Override
          public void onResponse(
            @NonNull Call call,
            @NonNull Response response
          ) throws IOException {
            try {
              if (!response.isSuccessful()) {
                // This condition checks if the status code is not in the range [200..300)
                throw new IOException("Unexpected code " + response);
              }

              // Handle your successful response here (status code 200-299)
              String responseData = Objects.requireNonNull(
                response.body()
              ).string(); // use response data

              JSONObject jsonObject = (JSONObject) new JSONTokener(
                responseData
              ).nextValue();
              String accessToken = jsonObject.getString("access_token"); // Here is the access token
              Log.i("Apple Access Token is: ", accessToken);
              Integer expiresIn = jsonObject.getInt("expires_in"); // When the access token expires
              Log.i("expires in: ", expiresIn.toString());
              String refreshToken = jsonObject.getString("refresh_token"); // The refresh token used to regenerate new access tokens. Store this token securely on your server.
              Log.i("refresh token: ", refreshToken);

              String idToken = jsonObject.getString("id_token"); // A JSON Web Token that contains the user's identity information.
              Log.i("ID Token: ", idToken);
              // Get encoded user id by splitting idToken and taking the 2nd piece
              String encodedUserID = idToken.split("\\.")[1];
              // Decode encoded UserID to JSON
              String decodedUserData = new String(
                Base64.decode(encodedUserID, Base64.DEFAULT)
              );
              JSONObject userDataJsonObject = new JSONObject(decodedUserData);
              // Get User's ID
              String userId = userDataJsonObject.getString("sub");
              Log.i("Apple User ID :", userId);

              ArrayMap<String, Object> notifyMap = new ArrayMap<>();
              notifyMap.put("provider", "apple");
              notifyMap.put("status", "success");
              persistState(idToken, refreshToken, accessToken);
              AppleWebViewClient.this.result.resolveSuccess(null);
            } catch (Exception e) {
              Log.e(
                SocialLoginPlugin.LOG_TAG,
                "Cannot get access_token (success error)",
                e
              );
            } finally {
              response.close();
            }
          }
        }
      );
    }

    private void persistState(
      String idToken,
      String refreshToken,
      String accessToken
    ) throws JSONException {
      JSONObject object = new JSONObject();
      object.put("idToken", idToken);
      object.put("refreshToken", refreshToken);
      object.put("accessToken", accessToken);

      AppleProvider.this.idToken = idToken;
      AppleProvider.this.refreshToken = refreshToken;
      AppleProvider.this.accessToken = accessToken;

      Log.i(
        SocialLoginPlugin.LOG_TAG,
        String.format("Apple persistState: %s", object)
      );
      this.helpers.putSharedPreferencePrivate(
          AppleProvider.SHARED_PREFERENCE_NAME,
          object.toString()
        );
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private void setupWebview(
    Context context,
    Activity activity,
    PluginHelpers helpers,
    FutureFunctionResult<JSONObject, String> result,
    String url
  ) {
    this.appledialog = new Dialog(context, R.style.CustomDialogTheme);

    // Set the dialog window to match the screen width and height
    Window window = appledialog.getWindow();
    if (window != null) {
      window.setLayout(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT
      );
      window.setGravity(Gravity.TOP);
      window.setBackgroundDrawable(new ColorDrawable(Color.WHITE));
      window.setDimAmount(0.0f);
    }

    // Inflate the custom layout
    View customView = activity
      .getLayoutInflater()
      .inflate(R.layout.dialog_custom_layout, null);

    // Find the WebView and progress bar in the custom layout
    WebView webView = customView.findViewById(R.id.webview);
    ProgressBar progressBar = customView.findViewById(R.id.progress_bar);

    webView.setVerticalScrollBarEnabled(false);
    webView.setHorizontalScrollBarEnabled(false);

    AppleWebViewClient view = new AppleWebViewClient(
      activity,
      helpers,
      result,
      this.redirectUrl,
      this.clientId
    ) {
      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        progressBar.setVisibility(View.VISIBLE);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        progressBar.setVisibility(View.GONE);
      }
    };

    webView.setWebViewClient(view);

    webView.getSettings().setJavaScriptEnabled(true);
    webView.loadUrl(url);

    // Find the close button in the custom layout and set click listener
    ImageButton closeButton = customView.findViewById(R.id.close_button);
    closeButton.setOnClickListener(v -> appledialog.dismiss());

    appledialog.setContentView(customView);

    appledialog.show();
  }
}
