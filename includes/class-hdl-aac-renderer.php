<?php
/**
 * Renderer for ClearVoice AAC standalone PWA page, Service Worker, Manifest, and Shortcode.
 *
 * @package HDL_AAC_Speech
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HDL_AAC_Renderer {

	/**
	 * Convert a WordPress URL to use the current HTTP_HOST so LAN mobile devices/tablets load assets properly.
	 *
	 * @param string $url Original URL.
	 * @return string
	 */
	public function to_current_host_url( $url ) {
		if ( empty( $_SERVER['HTTP_HOST'] ) ) {
			return $url;
		}
		$host = sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) );
		$path = wp_parse_url( $url, PHP_URL_PATH );
		$qry  = wp_parse_url( $url, PHP_URL_QUERY );
		if ( ! is_string( $path ) || '' === $path ) {
			return $url;
		}
		$scheme = is_ssl() ? 'https' : 'http';
		if ( ! empty( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) ) {
			$scheme = sanitize_key( wp_unslash( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) );
		}
		$rebuilt = $scheme . '://' . $host . $path;
		if ( is_string( $qry ) && '' !== $qry ) {
			$rebuilt .= '?' . $qry;
		}
		return $rebuilt;
	}

	/**
	 * Build frontend bootstrap config array.
	 *
	 * @return array
	 */
	public function get_bootstrap_config() {
		$user        = wp_get_current_user();
		$ai_settings = get_option( 'hdl_aac_ai_settings', array() );
		$server_key  = isset( $ai_settings['api_key'] ) ? trim( (string) $ai_settings['api_key'] ) : '';
		return array(
			'version'                => HDL_AAC_VERSION,
			'appUrl'                 => $this->to_current_host_url( home_url( '/hdl-aac-speech' ) ),
			'restUrl'                => $this->to_current_host_url( rest_url( 'hdl-aac-speech/v1' ) ),
			'restNonce'              => wp_create_nonce( 'wp_rest' ),
			'hasServerAiKey'         => strlen( $server_key ) > 10,
			'aiProvider'             => isset( $ai_settings['provider'] ) ? (string) $ai_settings['provider'] : 'gemini',
			'defaultAcademicContext' => isset( $ai_settings['academic_context'] ) ? (string) $ai_settings['academic_context'] : 'General Classroom & Open Academic Speech',
			'isLoggedIn'             => is_user_logged_in(),
			'currentUser'            => is_user_logged_in() ? array(
				'id'   => (int) $user->ID,
				'name' => (string) $user->display_name,
			) : null,
		);
	}

	/**
	 * Serve the PWA Web App Manifest JSON.
	 *
	 * @return void
	 */
	public function serve_manifest() {
		$app_url  = $this->to_current_host_url( home_url( '/hdl-aac-speech' ) );
		$icon_url = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'public/icon.svg' );

		$manifest = array(
			'name'             => 'ClearVoice AAC',
			'short_name'       => 'ClearVoice',
			'description'      => 'Offline Push-to-Listen & Context-Aware Speech Companion',
			'start_url'        => $app_url,
			'scope'            => $this->to_current_host_url( home_url( '/' ) ),
			'display'          => 'standalone',
			'background_color' => '#0f172a',
			'theme_color'      => '#0f172a',
			'icons'            => array(
				array(
					'src'     => $icon_url,
					'sizes'   => '192x192 512x512',
					'type'    => 'image/svg+xml',
					'purpose' => 'any maskable',
				),
			),
		);

		status_header( 200 );
		header( 'Content-Type: application/manifest+json; charset=utf-8' );
		header( 'Cache-Control: public, max-age=3600' );
		echo wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		exit;
	}

	/**
	 * Serve the Offline Service Worker JS from the app route scope.
	 *
	 * @return void
	 */
	public function serve_service_worker() {
		$app_url  = $this->to_current_host_url( home_url( '/hdl-aac-speech' ) );
		$js_path  = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.js';
		$css_path = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.css';
		$js_ver   = file_exists( $js_path ) ? (string) filemtime( $js_path ) : HDL_AAC_VERSION;
		$css_ver  = file_exists( $css_path ) ? (string) filemtime( $css_path ) : HDL_AAC_VERSION;

		$js_url       = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.js?ver=' . $js_ver );
		$css_url      = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.css?ver=' . $css_ver );
		$icon_url     = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'public/icon.svg' );
		$manifest_url = add_query_arg( 'hdl_aac_asset', 'manifest.json', $app_url );

		$precache_urls = array(
			$app_url,
			$js_url,
			$css_url,
			$icon_url,
			$manifest_url,
		);

		status_header( 200 );
		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Service-Worker-Allowed: /' );
		header( 'Cache-Control: no-cache, no-store, must-revalidate' );
		?>
const CACHE_NAME = 'hdl-clearvoice-aac-wp-<?php echo esc_js( $js_ver ); ?>';
const PRECACHE_URLS = <?php echo wp_json_encode( $precache_urls, JSON_UNESCAPED_SLASHES ); ?>;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('hdl-clearvoice-aac-')) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  if (event.request.url.includes('/wp-json/hdl-aac-speech/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match(PRECACHE_URLS[0]);
          }
        });
      })
  );
});
		<?php
		exit;
	}

	/**
	 * Render the standalone full-screen PWA application shell.
	 *
	 * @return void
	 */
	public function render_standalone_app() {
		$app_url  = $this->to_current_host_url( home_url( '/hdl-aac-speech' ) );
		$js_path  = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.js';
		$css_path = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.css';
		$js_ver   = file_exists( $js_path ) ? (string) filemtime( $js_path ) : HDL_AAC_VERSION;
		$css_ver  = file_exists( $css_path ) ? (string) filemtime( $css_path ) : HDL_AAC_VERSION;

		$js_url       = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.js?ver=' . $js_ver );
		$css_url      = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.css?ver=' . $css_ver );
		$icon_url     = $this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'public/icon.svg' );
		$manifest_url = add_query_arg( 'hdl_aac_asset', 'manifest.json', $app_url );
		$sw_url       = add_query_arg( 'hdl_aac_asset', 'sw.js', $app_url );
		$config       = $this->get_bootstrap_config();

		status_header( 200 );
		header( 'Content-Type: text/html; charset=utf-8' );
		?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="ClearVoice AAC" />
	<meta name="theme-color" content="#0f172a" />
	<meta name="description" content="ClearVoice AAC: Offline Push-to-Listen & Hands-Free Speech Interpretation Companion" />
	<link rel="manifest" href="<?php echo esc_url( $manifest_url ); ?>" />
	<link rel="icon" type="image/svg+xml" href="<?php echo esc_url( $icon_url ); ?>" />
	<link rel="apple-touch-icon" href="<?php echo esc_url( $icon_url ); ?>" />
	<title>ClearVoice AAC — Smart Speech Companion</title>
	<link rel="stylesheet" href="<?php echo esc_url( $css_url ); ?>" />
</head>
<body class="bg-[#0f172a] text-[#f8fafc] select-none antialiased overflow-x-hidden min-h-screen">
	<div id="hdl-aac-speech-root"></div>
	<script>
		window.hdlAacSpeechConfig = <?php echo wp_json_encode( $config, JSON_UNESCAPED_SLASHES ); ?>;
	</script>
	<script src="<?php echo esc_url( $js_url ); ?>"></script>
	<script>
		if ('serviceWorker' in navigator) {
			window.addEventListener('load', function() {
				navigator.serviceWorker.register(<?php echo wp_json_encode( $sw_url ); ?>).catch(function(err) {
					console.log('ClearVoice SW registration note:', err);
				});
			});
		}
	</script>
</body>
</html>
		<?php
		exit;
	}

	/**
	 * Enqueue assets and render shortcode container when embedded inside a standard WordPress page.
	 *
	 * @return string
	 */
	public function render_shortcode() {
		$js_path  = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.js';
		$css_path = HDL_AAC_PLUGIN_DIR . 'assets/dist/app.css';
		$js_ver   = file_exists( $js_path ) ? (string) filemtime( $js_path ) : HDL_AAC_VERSION;
		$css_ver  = file_exists( $css_path ) ? (string) filemtime( $css_path ) : HDL_AAC_VERSION;

		wp_enqueue_style(
			'hdl-aac-speech-style',
			$this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.css' ),
			array(),
			$css_ver
		);

		wp_enqueue_script(
			'hdl-aac-speech-script',
			$this->to_current_host_url( HDL_AAC_PLUGIN_URL . 'assets/dist/app.js' ),
			array(),
			$js_ver,
			true
		);

		wp_localize_script( 'hdl-aac-speech-script', 'hdlAacSpeechConfig', $this->get_bootstrap_config() );

		return '<div id="hdl-aac-speech-root" class="hdl-aac-speech-embed"></div>';
	}
}
