<?php
/**
 * Optional Server-Side Backup Store for ClearVoice AAC Profiles.
 * The app is 100% offline-first using browser IndexedDB; when online, profiles can
 * optionally sync to WordPress per individual profile ID.
 *
 * @package HDL_AAC_Speech
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HDL_AAC_Storage {

	const OPTION_KEY = 'hdl_aac_speech_profiles_backup';

	/**
	 * Get all backed-up profiles indexed by profile ID.
	 *
	 * @return array
	 */
	public function get_all_profiles() {
		$stored = get_option( self::OPTION_KEY, array() );
		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * Save or update a single profile backup payload.
	 *
	 * @param array $data Decoded JSON profile export payload.
	 * @return bool
	 */
	public function save_profile_backup( $data ) {
		if ( ! is_array( $data ) || empty( $data['profile']['id'] ) || empty( $data['profile']['name'] ) ) {
			return false;
		}

		$profile_id = sanitize_text_field( (string) $data['profile']['id'] );
		if ( '' === $profile_id ) {
			return false;
		}

		$all = $this->get_all_profiles();

		// Limit stored profiles to 100 to prevent unbounded option growth.
		if ( count( $all ) >= 100 && ! isset( $all[ $profile_id ] ) ) {
			array_shift( $all );
		}

		$all[ $profile_id ] = array(
			'profile'         => array(
				'id'            => $profile_id,
				'name'          => sanitize_text_field( (string) $data['profile']['name'] ),
				'voiceType'     => isset( $data['profile']['voiceType'] ) ? sanitize_key( (string) $data['profile']['voiceType'] ) : 'child',
				'baselinePitch' => isset( $data['profile']['baselinePitch'] ) ? (int) $data['profile']['baselinePitch'] : 260,
				'createdAt'     => isset( $data['profile']['createdAt'] ) ? (int) $data['profile']['createdAt'] : time() * 1000,
				'settings'      => isset( $data['profile']['settings'] ) && is_array( $data['profile']['settings'] ) ? $data['profile']['settings'] : array(),
			),
			'learnedPatterns' => isset( $data['learnedPatterns'] ) && is_array( $data['learnedPatterns'] ) ? array_slice( $data['learnedPatterns'], 0, 500 ) : array(),
			'dictionary'      => isset( $data['dictionary'] ) && is_array( $data['dictionary'] ) ? array_slice( $data['dictionary'], 0, 500 ) : array(),
			'updatedAt'       => current_time( 'mysql' ),
			'wpUserId'        => get_current_user_id(),
		);

		update_option( self::OPTION_KEY, $all, false );
		return true;
	}
}
