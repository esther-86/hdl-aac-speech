<?php
/**
 * Plugin Name:       HDL ClearVoice AAC Speech
 * Plugin URI:        https://github.com/esther-86/aac-speech
 * Description:       Offline-capable mobile & web Augmentative and Alternative Communication (AAC) companion for WordPress. Push-to-Listen & Hands-Free speech interpretation that learns each user's individual speech pattern.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Esther Lai
 * License:           Apache-2.0
 * Text Domain:       hdl-aac-speech
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HDL_AAC_VERSION', '1.0.0' );
define( 'HDL_AAC_PLUGIN_FILE', __FILE__ );
define( 'HDL_AAC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'HDL_AAC_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once HDL_AAC_PLUGIN_DIR . 'includes/class-hdl-aac-storage.php';
require_once HDL_AAC_PLUGIN_DIR . 'includes/class-hdl-aac-renderer.php';

class HDL_AAC_Speech_Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var HDL_AAC_Speech_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Storage service.
	 *
	 * @var HDL_AAC_Storage
	 */
	public $storage;

	/**
	 * Renderer service.
	 *
	 * @var HDL_AAC_Renderer
	 */
	public $renderer;

	/**
	 * Get singleton instance.
	 *
	 * @return HDL_AAC_Speech_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$this->storage  = new HDL_AAC_Storage();
		$this->renderer = new HDL_AAC_Renderer();

		add_action( 'init', array( $this, 'register_rewrites_and_shortcodes' ) );
		add_action( 'init', array( $this, 'maybe_handle_standalone_request' ), 20 );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
		add_action( 'admin_menu', array( $this, 'register_admin_menu' ) );
	}

	/**
	 * Plugin activation hook.
	 *
	 * @return void
	 */
	public static function activate() {
		$plugin = self::instance();
		$plugin->register_rewrites_and_shortcodes();
		if ( function_exists( 'flush_rewrite_rules' ) ) {
			flush_rewrite_rules();
		}
	}

	/**
	 * Register rewrite rules for /hdl-aac-speech, /aac-speech, /clearvoice and shortcodes.
	 *
	 * @return void
	 */
	public function register_rewrites_and_shortcodes() {
		add_rewrite_tag( '%hdl_aac_route%', '([^&]+)' );
		add_rewrite_rule(
			'^(?:hdl-aac-speech|aac-speech|clearvoice)(?:/(.*))?/?$',
			'index.php?hdl_aac_route=$matches[1]',
			'top'
		);

		add_shortcode( 'hdl_aac_speech', array( $this->renderer, 'render_shortcode' ) );
		add_shortcode( 'aac_speech', array( $this->renderer, 'render_shortcode' ) );
		add_shortcode( 'clearvoice_aac', array( $this->renderer, 'render_shortcode' ) );
	}

	/**
	 * Detect if the current request targets the standalone ClearVoice AAC route.
	 *
	 * @return string|false Sub-route string ('' for root), or false if not an AAC route.
	 */
	public function parse_request_route() {
		if ( isset( $_GET['hdl_aac_speech'] ) ) {
			return '';
		}
		if ( isset( $_GET['hdl_aac_route'] ) ) {
			return trim( wp_unslash( (string) $_GET['hdl_aac_route'] ), '/' );
		}

		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$req_path    = wp_parse_url( $request_uri, PHP_URL_PATH );
		if ( ! is_string( $req_path ) ) {
			return false;
		}

		$home_path = wp_parse_url( home_url(), PHP_URL_PATH );
		$home_path = is_string( $home_path ) ? rtrim( $home_path, '/' ) : '';

		$rel_uri = $req_path;
		if ( '' !== $home_path && 0 === strpos( strtolower( $rel_uri ), strtolower( $home_path ) ) ) {
			$rel_uri = substr( $rel_uri, strlen( $home_path ) );
		}

		$rel_uri = ltrim( $rel_uri, '/' );
		if ( preg_match( '#^(?:hdl-aac-speech|aac-speech|clearvoice)(?:/(.*))?$#i', $rel_uri, $matches ) ) {
			return isset( $matches[1] ) ? trim( $matches[1], '/' ) : '';
		}

		return false;
	}

	/**
	 * Intercept and render standalone app, manifest.json, or sw.js.
	 *
	 * @return void
	 */
	public function maybe_handle_standalone_request() {
		$route = $this->parse_request_route();
		if ( false === $route ) {
			return;
		}

		$asset = isset( $_GET['hdl_aac_asset'] ) ? sanitize_file_name( wp_unslash( $_GET['hdl_aac_asset'] ) ) : $route;

		if ( 'manifest.json' === $asset ) {
			$this->renderer->serve_manifest();
		}

		if ( 'sw.js' === $asset ) {
			$this->renderer->serve_service_worker();
		}

		$this->renderer->render_standalone_app();
	}

	/**
	 * Register REST API endpoints for optional profile backup/sync.
	 *
	 * @return void
	 */
	public function register_rest_routes() {
		register_rest_route(
			'hdl-aac-speech/v1',
			'/profile-sync',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'handle_profile_sync' ),
					'permission_callback' => '__return_true',
				),
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'handle_get_profiles' ),
					'permission_callback' => function () {
						return current_user_can( 'manage_options' );
					},
				),
			)
		);

		register_rest_route(
			'hdl-aac-speech/v1',
			'/transcribe',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'handle_transcribe_audio' ),
					'permission_callback' => '__return_true',
				),
			)
		);

		register_rest_route(
			'hdl-aac-speech/v1',
			'/save-sample',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'handle_save_sample' ),
					'permission_callback' => '__return_true',
				),
			)
		);
	}

	/**
	 * Save base64 WAV audio into benchmark/user_clips/ and return its file path.
	 *
	 * @param string $audio_b64 Base64 audio string.
	 * @return string|false
	 */
	private function save_wav_clip( $audio_b64 ) {
		$raw_bytes = base64_decode( (string) $audio_b64 );
		if ( ! $raw_bytes || strlen( $raw_bytes ) < 200 ) {
			return false;
		}
		$clips_dir = HDL_AAC_PLUGIN_DIR . 'benchmark/user_clips';
		if ( ! file_exists( $clips_dir ) ) {
			wp_mkdir_p( $clips_dir );
		}
		$filename = 'utt_' . gmdate( 'Ymd_His' ) . '_' . wp_rand( 100, 999 ) . '.wav';
		$filepath = $clips_dir . '/' . $filename;
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $filepath, $raw_bytes );
		return $filepath;
	}

	/**
	 * Handle POST /wp-json/hdl-aac-speech/v1/save-sample.
	 * Saves any user edit as a live audio + text test/training case on the fly.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function handle_save_sample( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) || empty( $params['target'] ) ) {
			return new WP_REST_Response( array( 'saved' => false ), 400 );
		}

		$target       = sanitize_text_field( $params['target'] );
		$browser_hint = isset( $params['rawTranscript'] ) ? sanitize_text_field( $params['rawTranscript'] ) : '';
		$wav_path     = isset( $params['wavPath'] ) ? sanitize_text_field( $params['wavPath'] ) : '';

		if ( ( empty( $wav_path ) || ! file_exists( $wav_path ) ) && ! empty( $params['audioBase64'] ) ) {
			$saved_wav = $this->save_wav_clip( $params['audioBase64'] );
			if ( $saved_wav ) {
				$wav_path = $saved_wav;
			}
		}

		// Try warm local Faster-Whisper server on 127.0.0.1:8765 first
		$local_resp = wp_remote_post(
			'http://127.0.0.1:8765/learn',
			array(
				'timeout' => 10,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'wav_path'     => $wav_path,
						'target'       => $target,
						'browser_hint' => $browser_hint,
					)
				),
			)
		);

		if ( ! is_wp_error( $local_resp ) && 200 === wp_remote_retrieve_response_code( $local_resp ) ) {
			$decoded = json_decode( wp_remote_retrieve_body( $local_resp ), true );
			return new WP_REST_Response( $decoded, 200 );
		}

		// Fallback: update benchmark/learned_cases.json directly in PHP so it works even if Python server isn't running
		$learned_file = HDL_AAC_PLUGIN_DIR . 'benchmark/learned_cases.json';
		$cases        = array();
		if ( file_exists( $learned_file ) ) {
			$existing = json_decode( (string) file_get_contents( $learned_file ), true );
			if ( is_array( $existing ) ) {
				$cases = $existing;
			}
		}
		$cases[] = array(
			'id'           => 'user_case_' . ( count( $cases ) + 1 ),
			'wav_path'     => $wav_path,
			'raw_asr'      => $browser_hint,
			'target'       => $target,
			'acoustic_sig' => null,
			'source'       => 'live_user_edit',
		);
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $learned_file, wp_json_encode( $cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );

		return new WP_REST_Response(
			array(
				'saved'      => true,
				'target'     => $target,
				'wavPath'    => $wav_path,
				'totalCases' => count( $cases ),
			),
			200
		);
	}

	/**
	 * Handle POST /wp-json/hdl-aac-speech/v1/transcribe for High-Accuracy Audio Transcription.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function handle_transcribe_audio( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) || empty( $params['audioBase64'] ) ) {
			return new WP_REST_Response( array( 'error' => 'Missing audio payload' ), 400 );
		}

		$ai_settings      = get_option( 'hdl_aac_ai_settings', array() );
		$server_api_key   = isset( $ai_settings['api_key'] ) ? trim( (string) $ai_settings['api_key'] ) : '';
		$client_api_key   = isset( $params['apiKey'] ) ? trim( (string) $params['apiKey'] ) : '';
		$api_key          = '' !== $client_api_key ? $client_api_key : $server_api_key;
		$provider         = ! empty( $params['provider'] ) ? sanitize_key( $params['provider'] ) : ( isset( $ai_settings['provider'] ) ? $ai_settings['provider'] : 'local' );
		$mime_type        = ! empty( $params['mimeType'] ) ? sanitize_text_field( $params['mimeType'] ) : 'audio/wav';
		$browser_text     = isset( $params['browserTranscript'] ) ? sanitize_text_field( $params['browserTranscript'] ) : '';
		$academic_context = isset( $params['academicContext'] ) ? sanitize_text_field( $params['academicContext'] ) : 'General Classroom & Academic Subjects';
		$learned_hints    = isset( $params['learnedHints'] ) ? sanitize_textarea_field( $params['learnedHints'] ) : '';
		$custom_vocab     = isset( $params['customVocab'] ) ? sanitize_textarea_field( $params['customVocab'] ) : '';

		// Always save the unbroken WAV recording so if she edits the output, it becomes a test case on the fly!
		$saved_wav_path = $this->save_wav_clip( $params['audioBase64'] );

		// 1. Try local Faster-Whisper + Phonological Decoder server (http://127.0.0.1:8765/transcribe) first when no cloud API key is set or provider is local
		if ( $saved_wav_path && ( strlen( $api_key ) < 10 || 'local' === $provider ) ) {
			$local_resp = wp_remote_post(
				'http://127.0.0.1:8765/transcribe',
				array(
					'timeout' => 15,
					'headers' => array( 'Content-Type' => 'application/json' ),
					'body'    => wp_json_encode(
						array(
							'wav_path'     => $saved_wav_path,
							'browser_hint' => $browser_text,
						)
					),
				)
			);

			if ( ! is_wp_error( $local_resp ) && 200 === wp_remote_retrieve_response_code( $local_resp ) ) {
				$local_data = json_decode( wp_remote_retrieve_body( $local_resp ), true );
				if ( is_array( $local_data ) && ! empty( $local_data['primary'] ) ) {
					$local_data['wavPath'] = $saved_wav_path;
					return new WP_REST_Response( $local_data, 200 );
				}
			}
		}

		if ( strlen( $api_key ) < 10 ) {
			return new WP_REST_Response(
				array(
					'primary'  => $browser_text,
					'rawAsr'   => $browser_text,
					'wavPath'  => $saved_wav_path ? $saved_wav_path : '',
					'provider' => 'browser-phonological',
				),
				200
			);
		}

		$phonological_prompt = "You are a pediatric Speech-Language Pathologist (SLP) and high-accuracy open-vocabulary speech decoder for a child whose voice has been acoustically calibrated (median pitch 239 Hz).\n"
			. "Decode her audio recording into the exact intended English sentence across ANY academic or school topic (Science, Math, Reading, Social Studies, or daily conversation).\n"
			. "KEY PHONOLOGICAL PROCESSES IN HER SPEECH:\n"
			. "1. Liquid Stopping (/l/ -> /d/): 'dook'='look', 'ditto'='little', 'dike'='like/likes', 'doud'='loud', 'dove'='love', 'dettis'='lettuce', 'deaf'='leaf', 'dearn'='learn', 'dight'='light'.\n"
			. "2. Palatal Glide Stopping (/j/ 'y' -> /d/): 'doo'='you', 'des'='yes', 'dellow'='yellow', 'doos'='use'.\n"
			. "3. Cluster Labialization (sw-, sl-, fl-, str-, fr- -> fw-/f-): 'fwimming'='swimming', 'fweet'='sweet', 'fwawbewwy'='strawberries', 'fwide'='slide', 'fwying'='flying', 'fwen fwy'='French fries', 'fwaction'='fraction'.\n"
			. "4. Liquid Gliding (/r/ -> /w/ and br/gr/tr/dr/pr/pl -> bw/gw/tw/dw/pw): 'wed'='red', 'wide'='ride', 'wet'='rest', 'wead'='read', 'wite'='write', 'gween'='green', 'bwuduh'='brother', 'bwake'='break', 'twain'='train', 'twiangle'='triangle', 'pwease'='please', 'pway'='play', 'pwant'='plant'.\n"
			. "5. Affricate & Fricative Stopping (ch->t, j->d, th->d/f): 'teese'='cheese', 'teatuh'='teacher', 'dump'='jump', 'de/dey/dat/dis'='the/they/that/this', 'dank doo'='thank you', 'bafwoom'='bathroom'.\n"
			. "6. Epenthesis & Final Cluster Reduction: 'suh-nack'='snack', 'fat'='fast', 'pak'='park', 'hep'='help'.\n"
			. "ACADEMIC / CLASSROOM CONTEXT: " . $academic_context . "\n"
			. "BROWSER ASR HYPOTHESIS: \"" . $browser_text . "\"\n"
			. "LEARNED SPEECH PATTERNS: " . $learned_hints . "\n"
			. "PERSONAL VOCABULARY: " . $custom_vocab . "\n"
			. 'Return strict JSON: {"primary": "Exact intended sentence", "alternatives": ["Runner-up 1", "Runner-up 2"]}';

		if ( 'openai' === $provider ) {
			$audio_binary = base64_decode( $params['audioBase64'] );
			if ( ! $audio_binary ) {
				return new WP_REST_Response( array( 'error' => 'Invalid base64 audio' ), 400 );
			}
			$boundary = wp_generate_password( 24, false );
			$ext      = false !== strpos( $mime_type, 'mp4' ) ? 'mp4' : 'webm';
			$body     = "--{$boundary}\r\n"
				. "Content-Disposition: form-data; name=\"file\"; filename=\"speech.{$ext}\"\r\n"
				. "Content-Type: {$mime_type}\r\n\r\n"
				. $audio_binary . "\r\n"
				. "--{$boundary}\r\n"
				. "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
				. "whisper-1\r\n"
				. "--{$boundary}\r\n"
				. "Content-Disposition: form-data; name=\"prompt\"\r\n\r\n"
				. substr( $academic_context . '. ' . $browser_text, 0, 400 ) . "\r\n"
				. "--{$boundary}--\r\n";

			$resp = wp_remote_post(
				'https://api.openai.com/v1/audio/transcriptions',
				array(
					'timeout' => 15,
					'headers' => array(
						'Authorization' => 'Bearer ' . $api_key,
						'Content-Type'  => 'multipart/form-data; boundary=' . $boundary,
					),
					'body'    => $body,
				)
			);

			if ( is_wp_error( $resp ) ) {
				return new WP_REST_Response( array( 'error' => $resp->get_error_message() ), 502 );
			}

			$json = json_decode( wp_remote_retrieve_body( $resp ), true );
			if ( ! empty( $json['text'] ) ) {
				return new WP_REST_Response(
					array(
						'primary'      => trim( (string) $json['text'] ),
						'alternatives' => array(),
						'provider'     => 'openai-whisper',
					),
					200
				);
			}
			return new WP_REST_Response( array( 'error' => 'Whisper returned empty response' ), 502 );
		}

		// Default: Google Gemini 2.5 Flash Multimodal Audio
		$gemini_url  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . rawurlencode( $api_key );
		$gemini_body = array(
			'contents'         => array(
				array(
					'parts' => array(
						array( 'text' => $phonological_prompt ),
						array(
							'inline_data' => array(
								'mime_type' => $mime_type,
								'data'      => $params['audioBase64'],
							),
						),
					),
				),
			),
			'generationConfig' => array(
				'temperature'      => 0.1,
				'responseMimeType' => 'application/json',
			),
		);

		$resp = wp_remote_post(
			$gemini_url,
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode( $gemini_body ),
			)
		);

		if ( is_wp_error( $resp ) ) {
			return new WP_REST_Response( array( 'error' => $resp->get_error_message() ), 502 );
		}

		$data     = json_decode( wp_remote_retrieve_body( $resp ), true );
		$raw_text = isset( $data['candidates'][0]['content']['parts'][0]['text'] ) ? $data['candidates'][0]['content']['parts'][0]['text'] : '';
		if ( ! empty( $raw_text ) ) {
			$parsed = json_decode( $raw_text, true );
			if ( is_array( $parsed ) && ! empty( $parsed['primary'] ) ) {
				return new WP_REST_Response(
					array(
						'primary'      => sanitize_text_field( $parsed['primary'] ),
						'alternatives' => isset( $parsed['alternatives'] ) && is_array( $parsed['alternatives'] ) ? array_map( 'sanitize_text_field', $parsed['alternatives'] ) : array(),
						'provider'     => 'gemini-2.5-flash',
					),
					200
				);
			}
		}

		return new WP_REST_Response( array( 'error' => 'Could not decode AI audio response' ), 502 );
	}

	/**
	 * Handle POST /wp-json/hdl-aac-speech/v1/profile-sync.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function handle_profile_sync( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			return new WP_REST_Response( array( 'saved' => false ), 400 );
		}

		$saved = $this->storage->save_profile_backup( $params );
		return new WP_REST_Response( array( 'saved' => $saved ), $saved ? 200 : 400 );
	}

	/**
	 * Handle GET /wp-json/hdl-aac-speech/v1/profile-sync (Admin overview).
	 *
	 * @return WP_REST_Response
	 */
	public function handle_get_profiles() {
		return new WP_REST_Response(
			array(
				'profiles' => array_values( $this->storage->get_all_profiles() ),
			),
			200
		);
	}

	/**
	 * Register Settings -> ClearVoice AAC Speech in WordPress Admin.
	 *
	 * @return void
	 */
	public function register_admin_menu() {
		add_options_page(
			'ClearVoice AAC Speech',
			'ClearVoice AAC Speech',
			'manage_options',
			'hdl-aac-speech',
			array( $this, 'render_admin_settings_page' )
		);
	}

	/**
	 * Render WordPress Admin Settings & Quick Launch page.
	 *
	 * @return void
	 */
	public function render_admin_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$saved_notice = false;
		if ( isset( $_POST['hdl_aac_save_ai_settings'] ) && check_admin_referer( 'hdl_aac_ai_settings_action', 'hdl_aac_ai_settings_nonce' ) ) {
			$new_settings = array(
				'provider'         => isset( $_POST['hdl_aac_ai_provider'] ) ? sanitize_key( wp_unslash( $_POST['hdl_aac_ai_provider'] ) ) : 'gemini',
				'api_key'          => isset( $_POST['hdl_aac_ai_api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['hdl_aac_ai_api_key'] ) ) : '',
				'academic_context' => isset( $_POST['hdl_aac_academic_context'] ) ? sanitize_text_field( wp_unslash( $_POST['hdl_aac_academic_context'] ) ) : 'General Classroom & Open Academic Speech',
			);
			update_option( 'hdl_aac_ai_settings', $new_settings );
			$saved_notice = true;
		}

		$ai_settings      = get_option( 'hdl_aac_ai_settings', array() );
		$current_provider = isset( $ai_settings['provider'] ) ? $ai_settings['provider'] : 'gemini';
		$current_api_key  = isset( $ai_settings['api_key'] ) ? $ai_settings['api_key'] : '';
		$current_context  = isset( $ai_settings['academic_context'] ) ? $ai_settings['academic_context'] : 'General Classroom & Open Academic Speech';

		$app_url  = home_url( '/hdl-aac-speech' );
		$profiles = $this->storage->get_all_profiles();
		?>
		<div class="wrap">
			<h1>ClearVoice AAC Speech Companion (<code>hdl-aac-speech</code>)</h1>
			<?php if ( $saved_notice ) : ?>
				<div class="notice notice-success is-dismissible"><p><strong>Academic AI Audio Settings saved!</strong></p></div>
			<?php endif; ?>
			<p>An offline-ready mobile and web Augmentative and Alternative Communication (AAC) app that listens when your child pushes the <strong>Listen</strong> button, writes the closest match to what she wants to say, speaks it out loud when she pushes <strong>Say It Out</strong>, and learns each person's unique speech pattern individually.</p>

			<p>
				<a class="button button-primary button-hero" href="<?php echo esc_url( $app_url ); ?>" target="_blank" rel="noopener">
					Launch ClearVoice AAC App (Full Screen) →
				</a>
			</p>

			<hr />

			<h2>High-Accuracy Academic & Open-Vocabulary AI Audio Settings</h2>
			<p>ClearVoice AAC includes a built-in <strong>Offline Open-Vocabulary Phonological Decoder</strong> calibrated to your daughter's 6 speech rules (<code>l➔d</code>, <code>y➔d</code>, <code>r➔w</code>, <code>sw/sl/fl/str/fr➔fw/f</code>, <code>ch/j/th➔t/d/f</code>). For maximum accuracy in academic and classroom settings (Science, Math, Reading, History), you can also enable <strong>Direct Raw Audio AI Transcription</strong> via Google Gemini 2.5 Flash Multimodal Audio or OpenAI Whisper:</p>

			<form method="post" action="">
				<?php wp_nonce_field( 'hdl_aac_ai_settings_action', 'hdl_aac_ai_settings_nonce' ); ?>
				<table class="form-table" role="presentation" style="max-width:760px;">
					<tr>
						<th scope="row"><label for="hdl_aac_ai_provider">AI Speech Audio Engine</label></th>
						<td>
							<select name="hdl_aac_ai_provider" id="hdl_aac_ai_provider">
								<option value="gemini" <?php selected( $current_provider, 'gemini' ); ?>>Google Gemini 2.5 Flash Multimodal Audio (Recommended — Understands Child Phonology Rules)</option>
								<option value="openai" <?php selected( $current_provider, 'openai' ); ?>>OpenAI Whisper (whisper-1) + Phonological Post-Decoder</option>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hdl_aac_ai_api_key">API Key (Gemini or OpenAI)</label></th>
						<td>
							<input type="password" name="hdl_aac_ai_api_key" id="hdl_aac_ai_api_key" value="<?php echo esc_attr( $current_api_key ); ?>" class="regular-text" placeholder="AIzaSy... or sk-..." />
							<p class="description">Stored on your WordPress server so any iPad, phone, or classroom laptop using your WordPress site automatically gets raw-audio AI transcription without needing to enter a key on the device.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hdl_aac_academic_context">Default Classroom / Academic Context</label></th>
						<td>
							<input type="text" name="hdl_aac_academic_context" id="hdl_aac_academic_context" value="<?php echo esc_attr( $current_context ); ?>" class="regular-text" style="width:100%;max-width:480px;" />
							<p class="description">Example: <code>Elementary School, Science, Math, Reading, History, Classroom Q&amp;A</code></p>
						</td>
					</tr>
				</table>
				<p class="submit">
					<button type="submit" name="hdl_aac_save_ai_settings" class="button button-primary">Save Academic AI Settings</button>
				</p>
			</form>

			<hr />

			<h2>How to Use on Mobile, Tablet, or Web (Offline & Online)</h2>
			<ol style="line-height:1.7;">
				<li><strong>Direct Standalone App URL:</strong> Open <a href="<?php echo esc_url( $app_url ); ?>" target="_blank"><code><?php echo esc_html( $app_url ); ?></code></a> (or <code><?php echo esc_html( home_url( '/clearvoice' ) ); ?></code>) on any phone, iPad, Android tablet, or computer.</li>
				<li><strong>Install for 100% Offline Use:</strong> On iOS Safari, tap <strong>Share → Add to Home Screen</strong>. On Android Chrome or Desktop Chrome/Edge, tap <strong>Install App / Add to Home Screen</strong>. The built-in Service Worker caches the entire app so it works even with no Wi-Fi or cellular data.</li>
				<li><strong>Embed on Any WordPress Page:</strong> Place the shortcode <code>[hdl_aac_speech]</code> (or <code>[aac_speech]</code>) inside any WordPress page or post.</li>
				<li><strong>Individual Speech Pattern Learning:</strong> Every device automatically creates an isolated on-device profile in <code>IndexedDB</code>, and multiple people sharing a device can switch or create their own profile from the top-right <strong>Profile Switcher</strong> (or launch via <code><?php echo esc_html( $app_url . '?user=Name' ); ?></code>).</li>
			</ol>

			<hr />

			<h2>Backed-Up Individual Profiles (<?php echo count( $profiles ); ?>)</h2>
			<?php if ( empty( $profiles ) ) : ?>
				<p><em>No profiles synced to the server yet. Profiles work 100% offline in the browser and automatically back up here when used online.</em></p>
			<?php else : ?>
				<table class="widefat striped" style="max-width:860px;">
					<thead>
						<tr>
							<th>Profile Name</th>
							<th>Voice Type</th>
							<th>Learned Speech Patterns</th>
							<th>Vocabulary Words</th>
							<th>Last Synced</th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $profiles as $item ) : ?>
							<tr>
								<td><strong><?php echo esc_html( $item['profile']['name'] ); ?></strong></td>
								<td><?php echo esc_html( ucfirst( $item['profile']['voiceType'] ) ); ?></td>
								<td><?php echo count( $item['learnedPatterns'] ); ?> patterns</td>
								<td><?php echo count( $item['dictionary'] ); ?> words</td>
								<td><?php echo esc_html( $item['updatedAt'] ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}
}

register_activation_hook( __FILE__, array( 'HDL_AAC_Speech_Plugin', 'activate' ) );
HDL_AAC_Speech_Plugin::instance();
