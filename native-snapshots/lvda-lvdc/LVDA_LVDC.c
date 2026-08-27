/*
 * LVDA_LVDC - Segregated Subsystem
 * Generated C code for subsystem module
 * Generated on: 2026-08-27T16:46:53.994Z
 */

#include "LVDA_LVDC.h"
#include <string.h>

/*
 * Initialize subsystem to default state
 */
void LVDA_LVDC_init(LVDA_LVDC_t* model) {
    memset(&model->inputs, 0, sizeof(model->inputs));
    memset(&model->outputs, 0, sizeof(model->outputs));
    memset(&model->signals, 0, sizeof(model->signals));
    memset(&model->states, 0, sizeof(model->states));
    memset(&model->data_stores, 0, sizeof(model->data_stores));
    memset(&model->enable_states, 0, sizeof(model->enable_states));
    model->time = 0.0;
    model->dt = 0.0;
    model->sample_tick = 0ULL;
    model->enabled = 1;

    /* Initialize constant sources */
    model->signals.Constant2 = -28; /* Constant2 */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_P_final = -1.0352499; /* LVDC_Chi_command_angles_Time_Tilt_P_final */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S1_sec = 63.8; /* LVDC_Chi_command_angles_Time_Tilt_T_S1_sec */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1 = 10; /* LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1 */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S2_sec = 109.8; /* LVDC_Chi_command_angles_Time_Tilt_T_S2_sec */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S3_sec = 134.3; /* LVDC_Chi_command_angles_Time_Tilt_T_S3_sec */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[0] = 1;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[1] = 1;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[2] = 1;
    /* LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit (double[3]) */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_yaw_command = 0; /* LVDC_Chi_command_angles_Time_Tilt_yaw_command */
    model->signals.LVDC_Chi_command_angles_Time_Tilt_zero = 0; /* LVDC_Chi_command_angles_Time_Tilt_zero */
    model->signals.LVDC_Iterative_Guidance_Mode_Constant3 = 1.8; /* LVDC_Iterative_Guidance_Mode_Constant3 */
    model->signals.LVDC_Iterative_Guidance_Mode_Constant5 = 1; /* LVDC_Iterative_Guidance_Mode_Constant5 */
    model->signals.LVDC_Iterative_Guidance_Mode_Constant6 = 1.51505854565e-7; /* LVDC_Iterative_Guidance_Mode_Constant6 */
    model->signals.LVDC_Iterative_Guidance_Mode_Constant7 = 1; /* LVDC_Iterative_Guidance_Mode_Constant7 */
    model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_N_sec = 1.6; /* LVDC_Iterative_Guidance_Mode_DeltaT_N_sec */
    model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant = 0.04; /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant */
    model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1 = 2; /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1 */
    model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground = 0; /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2 = 1; /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2 */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON = 1; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON = 4; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON = 1; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON = 1; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant = 4; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3 = 0; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3 */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete = 3; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant = 4; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3 = 0; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3 */
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2 = 2; /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2 */
    model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground = 0; /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground */
    model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Constant9 = 0.509295817894; /* LVDC_Iterative_Guidance_Mode_SMCY_Constant9 */
    model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Constant8 = 0.509295817894; /* LVDC_Iterative_Guidance_Mode_SMCZ_Constant8 */
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps[0] = 0;
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps[1] = 0;
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps[2] = 7780.67;
    /* LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps (double[3]) */
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2[0] = -9.15;
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2[1] = 0;
    model->signals.LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2[2] = 0;
    /* LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2 (double[3]) */
    model->signals.LVDC_Iterative_Guidance_Mode_const_ = 1.57079632679; /* LVDC_Iterative_Guidance_Mode_const_ */
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Constant5 = 0; /* LVDC_S_Frame_Position_Velocity_Calculations_Constant5 */
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant = -398603200000000; /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant */
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1 = -398603200000000; /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1 */
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[0] = 0.0120948;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[1] = 0.0213339;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[2] = -0.0261577;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[3] = -0.00526684;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[4] = 2.80483;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[5] = -2.8588;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[6] = 1.24933;
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[7] = -0.19736;
    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK (double[8]) */
    model->signals.T1_Timer_Constant = 0; /* T1_Timer_Constant */
    model->signals.T2_Timer_Constant = 0; /* T2_Timer_Constant */
    model->signals.T3_Timer_Constant = 0; /* T3_Timer_Constant */
    model->signals.T4_Timer_Constant = 0; /* T4_Timer_Constant */

    /* Block-specific initialization */
    // Initialize unit delay: LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2
    model->states.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[0] = -17.18;
    model->states.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[1] = 0;
    model->states.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[2] = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_Memory1
    model->states.LVDC_Iterative_Guidance_Mode_Memory1_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_Memory2
    model->states.LVDC_Iterative_Guidance_Mode_Memory2_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last
    model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2
    model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCY_SMCY
    model->states.LVDC_Iterative_Guidance_Mode_SMCY_SMCY_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last
    model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2
    model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ
    model->states.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ_state = 0;
    // Initialize unit delay: LVDC_Iterative_Guidance_Mode_loop
    model->states.LVDC_Iterative_Guidance_Mode_loop_state[0] = 0;
    model->states.LVDC_Iterative_Guidance_Mode_loop_state[1] = 0;
    model->states.LVDC_Iterative_Guidance_Mode_loop_state[2] = 0;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[0] = -0.5;
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[1] = 0;
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[2] = 0;
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_last_output = 0;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3_state = 0.135;
    // Initialize unit delay: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4
    model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4_state = 0.135;
    // Initialize unit delay: Memory
    model->states.Memory_state = 0;
    model->states.Rate_Limiter_last_output[0] = 0;
    model->states.Rate_Limiter_last_output[1] = 0;
    model->states.Rate_Limiter_last_output[2] = 0;

    LVDA_LVDC_evaluate_enable_states(model);
}

/* IGM terminal Chi latch: hold Add12/Add14 after first terminal major
 * (Add8<=15 / Position_Correction Compare) so atan(vigained) cannot
 * slew Chi_Z as vigained_y collapses. See RTW_VS_OBLIQ_CODEGEN_DISPARITY §1h. */
static int s_obliq_chi_term_hits = 0;
static int s_obliq_chi_ang_latched = 0;
static double s_obliq_chi_add12_latched = 0.0;
static double s_obliq_chi_add14_latched = 0.0;

/*
 * Compute outputs from inputs and states
 * This is the algebraic evaluation - no state changes
 * Input ports are accessed directly via model->inputs.PortName
 * Nested Action/Enable scopes gate algebra via enable_states (prev-step)
 */
void LVDA_LVDC_compute_outputs(LVDA_LVDC_t* model) {
    if (!model->enabled) {
        return; /* Module-level enable: freeze outs */
    }

    /* Compute block outputs in dependency order */

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2 */
    // Unit Delay block: LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2 (output phase)
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2[i] = model->states.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[i];
    }
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read */
            // Data Store Read: LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg;
    }
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read1 */
            // Data Store Read: LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg;
    }
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read2 */
            // Data Store Read: LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg;
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Mux1 */
    // Mux block: LVDC_Chi_command_angles_Time_Tilt_Mux1 (1×3)
    // Vector output
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux1[0] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux1[1] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read1;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux1[2] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read2;

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs1 */
    // Vector addition with signs (size 3)
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs1[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux1[i] - model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2[i];
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time (sample_time)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time = 1 * model->dt;

    /* LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Unary_Minus */
    // Unary minus block: LVDC_Chi_command_angles_Time_Tilt_Unary_Minus
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Unary_Minus[i] = -model->signals.LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[i];
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_fall_limit */
    // Vector element-wise *
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_fall_limit[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Unary_Minus[i] * (model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time);
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_rise_limit */
    // Vector element-wise *
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_rise_limit[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[i] * (model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time);
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Saturation_Dynamic */
    // Saturation Dynamic: LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Saturation_Dynamic (clamp u between lo and up)
    for (int i = 0; i < 3; i++) {
        double _u = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs1[i];
        double _up = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_rise_limit[i];
        double _lo = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_fall_limit[i];
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Saturation_Dynamic[i] = fmax(_lo, fmin(_up, _u));
    }

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2 */
    // Vector addition with signs (size 3)
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Saturation_Dynamic[i] + model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2[i];
    }
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Sum2 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Chi_to_Psi_Transformation_Sum2[i] = model->inputs.Theta_deg[i] + model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[i];
            }
    }

    /* LVDC_Chi_to_Psi_Transformation_Angle_Conversion2 */
    // Units Conversion: LVDC_Chi_to_Psi_Transformation_Angle_Conversion2 (deg -> rad)
    model->signals.LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[0] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum2[0] * (M_PI / 180.0);
    model->signals.LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[1] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum2[1] * (M_PI / 180.0);
    model->signals.LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[2] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum2[2] * (M_PI / 180.0);

    /* LVDC_Chi_to_Psi_Transformation_Selector */
    // Selector block: LVDC_Chi_to_Psi_Transformation_Selector indices=[2,0]
    model->signals.LVDC_Chi_to_Psi_Transformation_Selector[0] = model->signals.LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[2];
    model->signals.LVDC_Chi_to_Psi_Transformation_Selector[1] = model->signals.LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[0];

    /* LVDC_Chi_to_Psi_Transformation_Gain1 */
    // Scale block: LVDC_Chi_to_Psi_Transformation_Gain1 (gain = 0.5)
    for (int i = 0; i < 2; i++) {
        model->signals.LVDC_Chi_to_Psi_Transformation_Gain1[i] = model->signals.LVDC_Chi_to_Psi_Transformation_Selector[i] * 0.5;
    }

    /* LVDC_Chi_to_Psi_Transformation_SinCos */
    // Trig block: LVDC_Chi_to_Psi_Transformation_SinCos (sincos)
    model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_sin[0] = sin(model->signals.LVDC_Chi_to_Psi_Transformation_Gain1[0]);
    model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_cos[0] = cos(model->signals.LVDC_Chi_to_Psi_Transformation_Gain1[0]);
    model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_sin[1] = sin(model->signals.LVDC_Chi_to_Psi_Transformation_Gain1[1]);
    model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_cos[1] = cos(model->signals.LVDC_Chi_to_Psi_Transformation_Gain1[1]);

    /* LVDC_Chi_to_Psi_Transformation_Demux1 */
    // Demux block: LVDC_Chi_to_Psi_Transformation_Demux1
    // Demux vector input
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux1_0 = model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_sin[0];
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux1_1 = model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_sin[1];

    /* LVDC_Chi_to_Psi_Transformation_Demux2 */
    // Demux block: LVDC_Chi_to_Psi_Transformation_Demux2
    // Demux vector input
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_0 = model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_cos[0];
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_1 = model->signals.LVDC_Chi_to_Psi_Transformation_SinCos_cos[1];

    /* LVDC_Chi_to_Psi_Transformation_Product4 */
    model->signals.LVDC_Chi_to_Psi_Transformation_Product4 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux1_1 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_0;
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Sum1 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Chi_to_Psi_Transformation_Sum1[i] = -model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[i] + model->inputs.Theta_deg[i];
            }
    }

    /* LVDC_Chi_to_Psi_Transformation_Demux */
    // Demux block: LVDC_Chi_to_Psi_Transformation_Demux
    // Demux vector input
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux_0 = model->signals.LVDC_Chi_to_Psi_Transformation_Sum1[0];
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux_1 = model->signals.LVDC_Chi_to_Psi_Transformation_Sum1[1];
    model->signals.LVDC_Chi_to_Psi_Transformation_Demux_2 = model->signals.LVDC_Chi_to_Psi_Transformation_Sum1[2];
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Product8 */
            model->signals.LVDC_Chi_to_Psi_Transformation_Product8 = model->signals.LVDC_Chi_to_Psi_Transformation_Product4 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux_1;
    }
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Product7 */
            model->signals.LVDC_Chi_to_Psi_Transformation_Product7 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_1 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux_2;
    }

    /* LVDC_Chi_to_Psi_Transformation_Sum4 */
    model->signals.LVDC_Chi_to_Psi_Transformation_Sum4 = model->signals.LVDC_Chi_to_Psi_Transformation_Product7 - model->signals.LVDC_Chi_to_Psi_Transformation_Product8;
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Product6 */
            model->signals.LVDC_Chi_to_Psi_Transformation_Product6 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux1_1 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux_2;
    }

    /* LVDC_Chi_to_Psi_Transformation_Product3 */
    model->signals.LVDC_Chi_to_Psi_Transformation_Product3 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_0 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux2_1;
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Product5 */
            model->signals.LVDC_Chi_to_Psi_Transformation_Product5 = model->signals.LVDC_Chi_to_Psi_Transformation_Product3 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux_1;
    }

    /* LVDC_Chi_to_Psi_Transformation_Sum3 */
    model->signals.LVDC_Chi_to_Psi_Transformation_Sum3 = model->signals.LVDC_Chi_to_Psi_Transformation_Product5 + model->signals.LVDC_Chi_to_Psi_Transformation_Product6;
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_to_Psi_Transformation_Product10 */
            model->signals.LVDC_Chi_to_Psi_Transformation_Product10 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux1_0 * model->signals.LVDC_Chi_to_Psi_Transformation_Demux_1;
    }

    /* LVDC_Chi_to_Psi_Transformation_Sum5 */
    model->signals.LVDC_Chi_to_Psi_Transformation_Sum5 = model->signals.LVDC_Chi_to_Psi_Transformation_Demux_0 + model->signals.LVDC_Chi_to_Psi_Transformation_Product10;

    /* LVDC_Chi_to_Psi_Transformation_Mux */
    // Mux block: LVDC_Chi_to_Psi_Transformation_Mux (1×3)
    // Vector output
    model->signals.LVDC_Chi_to_Psi_Transformation_Mux[0] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum5;
    model->signals.LVDC_Chi_to_Psi_Transformation_Mux[1] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum3;
    model->signals.LVDC_Chi_to_Psi_Transformation_Mux[2] = model->signals.LVDC_Chi_to_Psi_Transformation_Sum4;

    /* Rate_Limiter */
    // Rate Limiter block: Rate_Limiter
    // rising=12/s, falling=-12/s, Ts=model->dt
    {
        double Rate_Limiter_max_delta = (12) * (model->dt);
        double Rate_Limiter_min_delta = (-12) * (model->dt);
        for (int i = 0; i < 3; i++) {
            double Rate_Limiter_delta = (model->signals.LVDC_Chi_to_Psi_Transformation_Mux[i]) - model->states.Rate_Limiter_last_output[i];
            if (Rate_Limiter_delta > Rate_Limiter_max_delta) Rate_Limiter_delta = Rate_Limiter_max_delta;
            if (Rate_Limiter_delta < Rate_Limiter_min_delta) Rate_Limiter_delta = Rate_Limiter_min_delta;
            model->signals.Rate_Limiter[i] = model->states.Rate_Limiter_last_output[i] + Rate_Limiter_delta;
            model->states.Rate_Limiter_last_output[i] = model->signals.Rate_Limiter[i];
        }
    }

    /* _15_3 */
    // Limit block: _15_3 (lower = -15.3, upper = 15.3)
    for (int i = 0; i < 3; i++) {
        model->signals._15_3[i] = fmax(-15.3, fmin(15.3, model->signals.Rate_Limiter[i]));
    }

    /* T3_Timer_Clock */
    // Clock block: T3_Timer_Clock
    model->signals.T3_Timer_Clock = model->time;

    /* T3_Timer_Data_Store_Read */
    // Data Store Read: T3_Timer_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A
    model->signals.T3_Timer_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A;

    /* T3_Timer_Sum */
    model->signals.T3_Timer_Sum = model->signals.T3_Timer_Clock - model->signals.T3_Timer_Data_Store_Read;

    /* T3_Timer_Constant */
    // Source block: T3_Timer_Constant (constant)
    // (constant value initialized in _init)

    /* T3_Timer_Switch */
    // If block: T3_Timer_Switch
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 >= Threshold (threshold=0)
    model->signals.T3_Timer_Switch = ((model->signals.T3_Timer_Data_Store_Read) >= (0)) ? model->signals.T3_Timer_Sum : model->signals.T3_Timer_Constant;

    /* Compare_To_Zero */
    // Condition block: Compare_To_Zero
    // Evaluate condition: input > 0
    model->signals.Compare_To_Zero = (model->signals.T3_Timer_Switch > 0);

    /* Constant2 */
    // Source block: Constant2 (constant)
    // (constant value initialized in _init)

    /* Cutoff_Enable */
    // Condition block: Cutoff_Enable
    // Evaluate condition: input >= 10.0
    model->signals.Cutoff_Enable = (model->signals.T3_Timer_Switch >= 10.0);

    /* D_A_Converter_Quantization */
    // Quantizer block: D_A_Converter_Quantization (quantum=0.0575)
    for (int i = 0; i < 3; i++) {
        model->signals.D_A_Converter_Quantization[i] = (0.0575) * floor((model->signals._15_3[i]) / (0.0575) + 0.5);
    }

    /* T2_Timer_Clock */
    // Clock block: T2_Timer_Clock
    model->signals.T2_Timer_Clock = model->time;

    /* T2_Timer_Data_Store_Read */
    // Data Store Read: T2_Timer_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A
    model->signals.T2_Timer_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A;

    /* T2_Timer_Sum */
    model->signals.T2_Timer_Sum = model->signals.T2_Timer_Clock - model->signals.T2_Timer_Data_Store_Read;

    /* T2_Timer_Constant */
    // Source block: T2_Timer_Constant (constant)
    // (constant value initialized in _init)

    /* T2_Timer_Switch */
    // If block: T2_Timer_Switch
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 >= Threshold (threshold=0)
    model->signals.T2_Timer_Switch = ((model->signals.T2_Timer_Data_Store_Read) >= (0)) ? model->signals.T2_Timer_Sum : model->signals.T2_Timer_Constant;

    /* IECO_2 */
    // Condition block: IECO_2
    // Evaluate condition: input >= 3.2
    model->signals.IECO_2 = (model->signals.T2_Timer_Switch >= 3.2);

    /* IGM_Enable_3 */
    // Condition block: IGM_Enable_3
    // Evaluate condition: input >= 44.0
    model->signals.IGM_Enable_3 = (model->signals.T3_Timer_Switch >= 44.0);

    /* J_2_Engine_Start_3 */
    // Condition block: J_2_Engine_Start_3
    // Evaluate condition: input >= 2.7
    model->signals.J_2_Engine_Start_3 = (model->signals.T3_Timer_Switch >= 2.7);

    /* T1_Timer_Clock */
    // Clock block: T1_Timer_Clock
    model->signals.T1_Timer_Clock = model->time;

    /* T1_Timer_Data_Store_Read */
    // Data Store Read: T1_Timer_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A
    model->signals.T1_Timer_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A;

    /* T1_Timer_Sum */
    model->signals.T1_Timer_Sum = model->signals.T1_Timer_Clock - model->signals.T1_Timer_Data_Store_Read;

    /* T1_Timer_Constant */
    // Source block: T1_Timer_Constant (constant)
    // (constant value initialized in _init)

    /* T1_Timer_Switch */
    // If block: T1_Timer_Switch
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 >= Threshold (threshold=0)
    model->signals.T1_Timer_Switch = ((model->signals.T1_Timer_Data_Store_Read) >= (0)) ? model->signals.T1_Timer_Sum : model->signals.T1_Timer_Constant;
    if ((model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Chi_command_angles_Time_Tilt__0_T_S2 */
            // Limit block: LVDC_Chi_command_angles_Time_Tilt__0_T_S2 (lower = 10, upper = 134.3)
            model->signals.LVDC_Chi_command_angles_Time_Tilt__0_T_S2 = fmax(10, fmin(134.3, model->signals.T1_Timer_Switch));
    }

    /* LVDC_Chi_command_angles_Time_Tilt_zero */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_zero (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1 */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1 (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3
    // Expression: in(0)<=in(1)
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3_in0 = model->signals.T1_Timer_Switch;
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3_in1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3 = (_eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3_in0 <= _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3_in1);

    /* LVDC_Chi_command_angles_Time_Tilt_T_S1_sec */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_T_S1_sec (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Relational_Operator */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_Relational_Operator
    // Expression: in(0)<=in(1)
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator_in0 = model->signals.T1_Timer_Switch;
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator_in1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S1_sec;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator = (_eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator_in0 <= _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator_in1);

    /* LVDC_Chi_command_angles_Time_Tilt_T_S2_sec */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_T_S2_sec (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1
    // Expression: in(0)<=in(1)
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1_in0 = model->signals.T1_Timer_Switch;
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1_in1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S2_sec;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1 = (_eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1_in0 <= _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1_in1);

    /* LVDC_Chi_command_angles_Time_Tilt_F_2 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_F_2
    // Expression: ((((((3.50965e-7)*in(0)+(-0.0000384334)))*in(0)+(-0.0108052)))*in(0)+(0.337135))
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_F_2_in0 = model->signals.LVDC_Chi_command_angles_Time_Tilt__0_T_S2;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_F_2 = ((((((3.50965e-7 * _eval_LVDC_Chi_command_angles_Time_Tilt_F_2_in0) + (-0.0000384334)) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_2_in0) + (-0.0108052)) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_2_in0) + 0.337135);

    /* LVDC_Chi_command_angles_Time_Tilt_T_S3_sec */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_T_S3_sec (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2
    // Expression: in(0)<=in(1)
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2_in0 = model->signals.T1_Timer_Switch;
    double _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2_in1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_T_S3_sec;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2 = (_eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2_in0 <= _eval_LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2_in1);
    /* Same-step enable refresh from LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2 */
    model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled = ((model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2) ? 1 : 0);

    /* LVDC_Chi_command_angles_Time_Tilt_F_3 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_F_3
    // Expression: ((((((1.03404e-7)*in(0)+(-0.000010118)))*in(0)+(-0.00978481)))*in(0)+(0.210868))
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_F_3_in0 = model->signals.LVDC_Chi_command_angles_Time_Tilt__0_T_S2;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_F_3 = ((((((1.03404e-7 * _eval_LVDC_Chi_command_angles_Time_Tilt_F_3_in0) + (-0.000010118)) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_3_in0) + (-0.00978481)) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_3_in0) + 0.210868);

    /* LVDC_Chi_command_angles_Time_Tilt_P_final */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_P_final (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Switch2 */
    // If block: LVDC_Chi_command_angles_Time_Tilt_Switch2
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 ~= 0 (threshold=0)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch2 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2 ? model->signals.LVDC_Chi_command_angles_Time_Tilt_F_3 : model->signals.LVDC_Chi_command_angles_Time_Tilt_P_final;

    /* LVDC_Chi_command_angles_Time_Tilt_Switch1 */
    // If block: LVDC_Chi_command_angles_Time_Tilt_Switch1
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 ~= 0 (threshold=0)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1 ? model->signals.LVDC_Chi_command_angles_Time_Tilt_F_2 : model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch2;

    /* LVDC_Chi_command_angles_Time_Tilt_F_1 */
    // Evaluate block: LVDC_Chi_command_angles_Time_Tilt_F_1
    // Expression: ((((((0.0000011473)*in(0)+(-0.00022283)))*in(0)+(0.00320258)))*in(0)+(-0.0139871))
    // Input variables
    double _eval_LVDC_Chi_command_angles_Time_Tilt_F_1_in0 = model->signals.LVDC_Chi_command_angles_Time_Tilt__0_T_S2;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_F_1 = ((((((0.0000011473 * _eval_LVDC_Chi_command_angles_Time_Tilt_F_1_in0) + (-0.00022283)) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_1_in0) + 0.00320258) * _eval_LVDC_Chi_command_angles_Time_Tilt_F_1_in0) + (-0.0139871));

    /* LVDC_Chi_command_angles_Time_Tilt_Switch */
    // If block: LVDC_Chi_command_angles_Time_Tilt_Switch
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 ~= 0 (threshold=0)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch = model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator ? model->signals.LVDC_Chi_command_angles_Time_Tilt_F_1 : model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch1;

    /* LVDC_Chi_command_angles_Time_Tilt_Switch5 */
    // If block: LVDC_Chi_command_angles_Time_Tilt_Switch5
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 ~= 0 (threshold=0)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch5 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3 ? model->signals.LVDC_Chi_command_angles_Time_Tilt_zero : model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch;

    /* LVDC_Chi_command_angles_Time_Tilt_Angle_Conversion */
    // Units Conversion: LVDC_Chi_command_angles_Time_Tilt_Angle_Conversion (rad -> deg)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Angle_Conversion = model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch5 * (180.0 / M_PI);

    /* LVDC_Chi_command_angles_Time_Tilt_Compare_To_Constant */
    // Condition block: LVDC_Chi_command_angles_Time_Tilt_Compare_To_Constant
    // Evaluate condition: input <= 10
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Compare_To_Constant = (model->signals.T1_Timer_Switch <= 10);

    /* LVDC_Chi_command_angles_Time_Tilt_Switch3 */
    // If block: LVDC_Chi_command_angles_Time_Tilt_Switch3
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 ~= 0 (threshold=0)
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch3 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Compare_To_Constant ? model->signals.Constant2 : model->signals.LVDC_Chi_command_angles_Time_Tilt_zero;

    /* LVDC_Chi_command_angles_Time_Tilt_yaw_command */
    // Source block: LVDC_Chi_command_angles_Time_Tilt_yaw_command (constant)
    // (constant value initialized in _init)

    /* LVDC_Chi_command_angles_Time_Tilt_Mux */
    // Mux block: LVDC_Chi_command_angles_Time_Tilt_Mux (1×3)
    // Vector output
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[0] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Switch3;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[1] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Angle_Conversion;
    model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[2] = model->signals.LVDC_Chi_command_angles_Time_Tilt_yaw_command;
    if (model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled) {

            /* LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux */
            // Demux block: LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux
            // Demux vector input
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_0 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[0];
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_1 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[1];
            model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_2 = model->signals.LVDC_Chi_command_angles_Time_Tilt_Mux[2];
    }
    if (model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled) {

            /* LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write */
            // Data Store Write: LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg = model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_0;
    }
    if (model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled) {

            /* LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write1 */
            // Data Store Write: LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write1 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg = model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_1;
    }
    if (model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled) {

            /* LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write2 */
            // Data Store Write: LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Data_Store_Write2 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg = model->signals.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_2;
    }

    /* Memory */
    // Unit Delay block: Memory (output phase)
    model->signals.Memory = model->states.Memory_state;

    /* Logical_Operator3 */
    // Evaluate block: Logical_Operator3
    // Expression: !(in(0))
    // Input variables
    double _eval_Logical_Operator3_in0 = model->signals.Memory;
    model->signals.Logical_Operator3 = (!_eval_Logical_Operator3_in0);

    /* Logical_Operator2 */
    // Evaluate block: Logical_Operator2
    // Expression: (in(0))&&(in(1))
    // Input variables
    double _eval_Logical_Operator2_in0 = model->signals.IGM_Enable_3;
    double _eval_Logical_Operator2_in1 = model->signals.Logical_Operator3;
    model->signals.Logical_Operator2 = (_eval_Logical_Operator2_in0 && _eval_Logical_Operator2_in1);
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant4 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant4 (constant)
            // Using parameter: Theta_T_deg → PARAM_Theta_T_deg
            model->signals.LVDC_Iterative_Guidance_Mode_Constant4 = PARAM_Theta_T_deg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion (deg -> rad)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion = model->signals.LVDC_Iterative_Guidance_Mode_Constant4 * (M_PI / 180.0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function (cos)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function = cos(model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant5 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant5 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function) / (model->signals.LVDC_Iterative_Guidance_Mode_Constant5);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Read2 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode
            model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_T3_FM */
    // Condition block: LVDC_S_Frame_Position_Velocity_Calculations_T3_FM
    // Evaluate condition: input >= 5.0
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_T3_FM = (model->signals.T3_Timer_Switch >= 5.0);

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4 (output phase)
    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4_state;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2 */
    // Unit Delay block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2 (output phase)
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2[i] = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[i];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum[i] = model->inputs.V_m_bar_mps[i] - model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2[i];
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3 */
            // Scale block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3 (gain = 0.625)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum[i] * 0.625;
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function4 */
            // Square (x^2) block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function4
            // Vector element-wise square
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function4[i] = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[i]) * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[i]);
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum_of_Elements1 */
            // Sum of Elements (vector[3] → scalar)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum_of_Elements1 = 0.0;
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum_of_Elements1 += model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function4[i];
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3
            // Expression: (in(0)<0?-sqrt(-in(0)):sqrt(in(0)))
            // Input variables
            double _eval_LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3_in0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum_of_Elements1;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3 = (((_eval_LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3_in0 < 0)) ? ((-sqrt((-_eval_LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3_in0)))) : (sqrt(_eval_LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3_in0)));
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11__0_25_sec_2_m */
            // Limit block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11__0_25_sec_2_m (lower = 4, upper = INFINITY)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11__0_25_sec_2_m = fmax(4, model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3);
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5
            // Expression: 1.0/in(0)
            // Input variables
            double _eval_LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5_in0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11__0_25_sec_2_m;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5 = (1.0 / _eval_LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5_in0);
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1 */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1 (1×8)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[3] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[4] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[5] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[6] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[7] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4;
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Product1 */
            // Vector element-wise *
            for (int i = 0; i < 8; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Product1[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[i] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[i];
            }
    }
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements */
            // Sum of Elements (vector[8] → scalar)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements = 0.0;
            for (int i = 0; i < 8; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements += model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Product1[i];
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations__0_25_sec_2_m */
            // Limit block: LVDC_S_Frame_Position_Velocity_Calculations__0_25_sec_2_m (lower = -4, upper = 4)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations__0_25_sec_2_m = fmax(-4, fmin(4, model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements));
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 */
            // Rate Limiter block: LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005
            // rising=0.005/s, falling=-0.005/s, Ts=1.6
            {
                double LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_max_delta = (0.005) * (1.6);
                double LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_min_delta = (-0.005) * (1.6);
                double LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations__0_25_sec_2_m) - model->states.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_last_output;
                if (LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta > LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_max_delta) LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta = LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_max_delta;
                if (LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta < LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_min_delta) LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta = LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_min_delta;
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 = model->states.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_last_output + LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_delta;
                model->states.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_last_output = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005;
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Gain2 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Gain2 (gain = 4135.6997)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Gain2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 * 4135.6997;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read2 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2 (1×4)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Gain2;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR1 (constant)
            // Using parameter: Mdot_3_kg_per_sec → PARAM_Mdot_3_kg_per_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR1 = PARAM_Mdot_3_kg_per_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR (constant)
            // Using parameter: M02_kg → PARAM_M02_kg
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR = PARAM_M02_kg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4 (constant)
            // Using parameter: T10_sec → PARAM_T10_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4 = PARAM_T10_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant2 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant2 (constant)
            // Using parameter: tau_1_0_sec → PARAM_tau_1_0_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant2 = PARAM_tau_1_0_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant2) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant5 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant5 (constant)
            // Using parameter: Mdot_1_kg_per_sec → PARAM_Mdot_1_kg_per_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant5 = PARAM_Mdot_1_kg_per_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant5 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add1) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Gain (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Gain = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Gain - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant6 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant6 (constant)
            // Using parameter: C_0_sec → PARAM_C_0_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant6 = PARAM_C_0_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide3 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide3
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide3 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant6);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function
            // Expression: (floor(in(1))!=in(1)&&in(0)<0?-pow(-in(0),in(1)):pow(in(0),in(1)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in0 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide3;
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function = ((((floor(_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in1) != _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in1) && (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in0 < 0))) ? ((-pow((-_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in0), _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in1))) : (pow(_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in0, _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function_in1)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Product */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Product = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Product;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read4 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read4 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read4 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2 (1×4)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR1 (constant)
            // Using parameter: Mdot_3_kg_per_sec → PARAM_Mdot_3_kg_per_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR1 = PARAM_Mdot_3_kg_per_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR (constant)
            // Using parameter: M02_kg → PARAM_M02_kg
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR = PARAM_M02_kg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4 (constant)
            // Using parameter: T10_sec → PARAM_T10_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4 = PARAM_T10_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant2 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant2 (constant)
            // Using parameter: tau_1_0_sec → PARAM_tau_1_0_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant2 = PARAM_tau_1_0_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant2) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant5 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant5 (constant)
            // Using parameter: Mdot_1_kg_per_sec → PARAM_Mdot_1_kg_per_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant5 = PARAM_Mdot_1_kg_per_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant5 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add1) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Gain (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Gain = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Gain - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6 (constant)
            // Using parameter: C_0_sec → PARAM_C_0_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6 = PARAM_C_0_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide3 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide3
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide3 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function
            // Expression: (floor(in(1))!=in(1)&&in(0)<0?-pow(-in(0),in(1)):pow(in(0),in(1)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in0 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide3;
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function = ((((floor(_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in1) != _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in1) && (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in0 < 0))) ? ((-pow((-_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in0), _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in1))) : (pow(_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in0, _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function_in1)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Product */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Product = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Product;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read4 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read4 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read4 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2 (1×4)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read2 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Constant1 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Constant1 = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read4 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read4 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read4 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Subtract3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Subtract3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read4 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Constant1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1 (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2 (1×4)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read2;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Subtract3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read2 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read3 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read3 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read3 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant1 (constant)
            // Using parameter: V_T_mps → PARAM_V_T_mps
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant1 = PARAM_V_T_mps;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant3 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant3 (constant)
            // Using parameter: DeltaV_b_mps → PARAM_DeltaV_b_mps
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant3 = PARAM_DeltaV_b_mps;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2 */
            // If block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            if (model->inputs.bLiftoff__tag) {
                // Copy input2 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2[i] = model->inputs.Ve_mps[i];
                }
            } else {
                // Copy input1 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2[i] = model->inputs.PAD_Ve_mps[i];
                }
            }
    }

    /* Stage_Sep_3 */
    // Condition block: Stage_Sep_3
    // Evaluate condition: input >= 1.38
    model->signals.Stage_Sep_3 = (model->signals.T3_Timer_Switch >= 1.38);
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1 */
            // If block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            if (model->signals.Stage_Sep_3) {
                // Copy input2 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1[i] = model->inputs.S_IVB_Ve_mps[i];
                }
            } else {
                // Copy input1 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2[i];
                }
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6 */
            // Matrix multiply block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[i] += model->inputs.MES_DCM[i][k] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function4 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Math_Function4
            // Vector element-wise square
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Math_Function4[i] = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[i]) * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[i]);
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Sum_of_Elements1 */
            // Sum of Elements (vector[3] → scalar)
            model->signals.LVDC_Iterative_Guidance_Mode_Sum_of_Elements1 = 0.0;
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Sum_of_Elements1 += model->signals.LVDC_Iterative_Guidance_Mode_Math_Function4[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function3 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Math_Function3
            // Expression: (in(0)<0?-sqrt(-in(0)):sqrt(in(0)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Math_Function3_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Sum_of_Elements1;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3 = (((_eval_LVDC_Iterative_Guidance_Mode_Math_Function3_in0 < 0)) ? ((-sqrt((-_eval_LVDC_Iterative_Guidance_Mode_Math_Function3_in0)))) : (sqrt(_eval_LVDC_Iterative_Guidance_Mode_Math_Function3_in0)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant1 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant3 - model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read4 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read4 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read4 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract5 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract5 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract5;
    }

    /* LVDC_Iterative_Guidance_Mode_Memory1 */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_Memory1 (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_Memory1 = model->states.LVDC_Iterative_Guidance_Mode_Memory1_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract1 = model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3 - model->signals.LVDC_Iterative_Guidance_Mode_Memory1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract1;
    }

    /* LVDC_Iterative_Guidance_Mode_Memory2 */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_Memory2 (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_Memory2 = model->states.LVDC_Iterative_Guidance_Mode_Memory2_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract2 = model->signals.LVDC_Iterative_Guidance_Mode_Memory1 - model->signals.LVDC_Iterative_Guidance_Mode_Memory2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract4) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract1) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract6 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract6 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product3 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract7 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract7 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract6 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2 = (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract3) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract7);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2 (1×4)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read2;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read3;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Multiport_Switch */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Multiport_Switch
            // Expression: (in(0)==(0)?in(1):((in(0)==(1)?in(2):((in(0)==(2)?in(3):((in(0)==(3)?in(4):((in(0)==(4)?in(5):(in(5)))))))))))
            // Evaluate multiport switch (vector size 4)
            {
                int _mp_idx = (int)(model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read2);
                if (_mp_idx == 0) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[3];
                }
                else if (_mp_idx == 1) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[3];
                }
                else if (_mp_idx == 2) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[3];
                }
                else if (_mp_idx == 3) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[3];
                }
                else if (_mp_idx == 4) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[3];
                }
                else {
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[0];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[1];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[2];
                    model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3] = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[3];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux4 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux4
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0 = model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1 = model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2 = model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[2];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3 = model->signals.LVDC_Iterative_Guidance_Mode_Multiport_Switch[3];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add */
            model->signals.LVDC_Iterative_Guidance_Mode_Add = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1 + model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product3 = model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3 * model->signals.LVDC_Iterative_Guidance_Mode_Add;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain6 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain6 (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain6 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add6 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add6 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2 - model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide6 */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide6
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide6 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add6);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2
            // Expression: (in(0)<=0?-INFINITY:log(in(0)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2_in0 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide6;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2 = (((_eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2_in0 <= 0)) ? ((-INFINITY)) : (log(_eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2_in0)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide7 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide7 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add8 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add8 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide7 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain6;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0 - model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function
            // Expression: (in(0)<=0?-INFINITY:log(in(0)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function_in0 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function = (((_eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function_in0 <= 0)) ? ((-INFINITY)) : (log(_eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function_in0)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain (gain = 4135.6997)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function * 4135.6997;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product4 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0 - model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product */
            model->signals.LVDC_Iterative_Guidance_Mode_Product = model->signals.LVDC_Iterative_Guidance_Mode_Add1 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add2 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2 - model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 * model->signals.LVDC_Iterative_Guidance_Mode_Add2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add3 = model->signals.LVDC_Iterative_Guidance_Mode_Product + model->signals.LVDC_Iterative_Guidance_Mode_Product1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant (constant)
            // Using parameter: V_T_mps → PARAM_V_T_mps
            model->signals.LVDC_Iterative_Guidance_Mode_Constant = PARAM_V_T_mps;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add4 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7 + model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3 - model->signals.LVDC_Iterative_Guidance_Mode_Constant;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant1 (constant)
            // Using parameter: V_ex3_mps → PARAM_V_ex3_mps
            model->signals.LVDC_Iterative_Guidance_Mode_Constant1 = PARAM_V_ex3_mps;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant3 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant3 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_Constant3) / (model->signals.LVDC_Iterative_Guidance_Mode_Constant1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product2 = model->signals.LVDC_Iterative_Guidance_Mode_Divide * model->signals.LVDC_Iterative_Guidance_Mode_Add3 * model->signals.LVDC_Iterative_Guidance_Mode_Add4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add5 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add5 = model->signals.LVDC_Iterative_Guidance_Mode_Product3 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add8 + model->signals.LVDC_Iterative_Guidance_Mode_Product4 - model->signals.LVDC_Iterative_Guidance_Mode_Product2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain1 (gain = 4135.6997)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain1 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1 * 4135.6997;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide1 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2 = -model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add6 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add6 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2 + model->signals.LVDC_Iterative_Guidance_Mode_Add5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant6 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant6 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product5 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product5 = model->signals.LVDC_Iterative_Guidance_Mode_Constant6 * model->signals.LVDC_Iterative_Guidance_Mode_Add6 * model->signals.LVDC_Iterative_Guidance_Mode_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant10 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant10 (constant)
            // Using parameter: A_z_deg → PARAM_A_z_deg
            model->signals.LVDC_Iterative_Guidance_Mode_Constant10 = PARAM_A_z_deg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant11 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant11 (constant)
            // Using parameter: phi_L_deg → PARAM_phi_L_deg
            model->signals.LVDC_Iterative_Guidance_Mode_Constant11 = PARAM_phi_L_deg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant13 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant13 (constant)
            // Using parameter: lambda_0_deg → PARAM_lambda_0_deg
            model->signals.LVDC_Iterative_Guidance_Mode_Constant13 = PARAM_lambda_0_deg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux */
            // Mux block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux (1×3)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[0] = model->signals.LVDC_Iterative_Guidance_Mode_Constant10;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[1] = model->signals.LVDC_Iterative_Guidance_Mode_Constant11;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[2] = model->signals.LVDC_Iterative_Guidance_Mode_Constant13;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2 (deg -> rad)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[0] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[0] * (M_PI / 180.0);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[1] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[1] * (M_PI / 180.0);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[2] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[2] * (M_PI / 180.0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux */
            // Demux block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_0 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[0];
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_1 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[1];
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_2 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[2];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3 */
            // Trig block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_0);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant12 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant12 (constant)
            // Using parameter: i_deg → PARAM_i_deg
            model->signals.LVDC_Iterative_Guidance_Mode_Constant12 = PARAM_i_deg;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1 (deg -> rad)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1 = model->signals.LVDC_Iterative_Guidance_Mode_Constant12 * (M_PI / 180.0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1 */
            // Trig block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2 */
            // Trig block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_1);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos */
            // Trig block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_2);
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux */
            // Mux block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux (1×8)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_cos;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_cos;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_cos;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__33 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__33
            // Expression: in(0)[7]*in(0)[2]*in(0)[1]*in(0)[3]-in(0)[6]*in(0)[4]*in(0)[3]+in(0)[7]*in(0)[5]*in(0)[0]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__33 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__22 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__22
            // Expression: in(0)[6]*in(0)[2]*in(0)[1]*in(0)[0]+in(0)[7]*in(0)[4]*in(0)[0]-in(0)[6]*in(0)[5]*in(0)[3]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__22 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__11 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__11
            // Expression: in(0)[5]*in(0)[4]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__11 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__23 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__23
            // Expression: -in(0)[6]*in(0)[2]*in(0)[1]*in(0)[3]-in(0)[7]*in(0)[4]*in(0)[3]-in(0)[6]*in(0)[5]*in(0)[0]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__23 = -model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__13 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__13
            // Expression: -in(0)[5]*in(0)[1]*in(0)[3]+in(0)[2]*in(0)[0]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__13 = -model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__32 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__32
            // Expression: -in(0)[7]*in(0)[2]*in(0)[1]*in(0)[0]+in(0)[6]*in(0)[4]*in(0)[0]+in(0)[7]*in(0)[5]*in(0)[3]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__32 = -model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__12 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__12
            // Expression: in(0)[5]*in(0)[1]*in(0)[0]+in(0)[2]*in(0)[3]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__12 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[5]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[0]+model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[3];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__31 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__31
            // Expression: -in(0)[7]*in(0)[2]*in(0)[4]-in(0)[6]*in(0)[1]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__31 = -model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__21 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__21
            // Expression: in(0)[6]*in(0)[2]*in(0)[4]-in(0)[7]*in(0)[1]
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__21 = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[6]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[2]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[4]-model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[7]*model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2 (3×3)
            // Matrix output (column-major input order)
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[0][0] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__11;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[0][1] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__12;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[0][2] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__13;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[1][0] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__21;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[1][1] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__22;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[1][2] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__23;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[2][0] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__31;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[2][1] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__32;
            model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[2][2] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__33;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3 */
            // If block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            if (model->inputs.bLiftoff__tag) {
                // Copy input2 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3[i] = model->inputs.Xe_m[i];
                }
            } else {
                // Copy input1 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3[i] = model->inputs.PAD_Xe_m[i];
                }
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5 */
            // If block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            if (model->signals.Stage_Sep_3) {
                // Copy input2 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5[i] = model->inputs.S_IVB_Xe_m[i];
                }
            } else {
                // Copy input1 to output
                for (int i = 0; i < 3; i++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3[i];
                }
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18 */
            // Matrix multiply block: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[i] += model->inputs.MES_DCM[i][k] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product6 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product6
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product6[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product6[i] += model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[i][k] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Selector */
            // Selector block: LVDC_Iterative_Guidance_Mode_Selector indices=[2,0]
            model->signals.LVDC_Iterative_Guidance_Mode_Selector[0] = model->signals.LVDC_Iterative_Guidance_Mode_Product6[2];
            model->signals.LVDC_Iterative_Guidance_Mode_Selector[1] = model->signals.LVDC_Iterative_Guidance_Mode_Product6[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux_0 = model->signals.LVDC_Iterative_Guidance_Mode_Selector[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux_1 = model->signals.LVDC_Iterative_Guidance_Mode_Selector[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function1 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function1 (atan2)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function1 = atan2(model->signals.LVDC_Iterative_Guidance_Mode_Demux_0, model->signals.LVDC_Iterative_Guidance_Mode_Demux_1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add7 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add7 = model->signals.LVDC_Iterative_Guidance_Mode_Product5 + model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos */
            // Trig block: LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Add7);
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Add7);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux */
            // Mux block: LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux (1×2)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[1] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__33 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__33
            // Expression: in(0)[1]
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__33 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__23 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__23
            // Expression: 0.0
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_M4V_Transform__23_in0 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0]; // vector→scalar head
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__23 = 0.0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__13 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__13
            // Expression: in(0)[0]
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__13 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__32 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__32
            // Expression: 0.0
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_M4V_Transform__32_in0 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0]; // vector→scalar head
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__32 = 0.0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__22 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__22
            // Expression: 1.0
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_M4V_Transform__22_in0 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0]; // vector→scalar head
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__22 = 1.0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__12 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__12
            // Expression: 0.0
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_M4V_Transform__12_in0 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0]; // vector→scalar head
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__12 = 0.0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__31 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__31
            // Expression: -in(0)[0]
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__31 = -model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__21 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__21
            // Expression: 0.0
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_M4V_Transform__21_in0 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[0]; // vector→scalar head
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__21 = 0.0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform__11 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_M4V_Transform__11
            // Expression: in(0)[1]
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__11 = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2 */
            // Mux block: LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2 (3×3)
            // Matrix output (column-major input order)
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[0][0] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__11;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[0][1] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__12;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[0][2] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__13;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[1][0] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__21;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[1][1] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__22;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[1][2] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__23;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[2][0] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__31;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[2][1] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__32;
            model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[2][2] = model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform__33;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124 */
            // Demux block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124
            // Demux vector input
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[0];
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[1];
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[2];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119 */
            // Demux block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119
            // Demux vector input
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[0];
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[1];
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[2];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Az_deg */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Az_deg (constant)
            // Using parameter: A_z_deg → PARAM_A_z_deg
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Az_deg = PARAM_A_z_deg;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion */
            // Units Conversion: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion (deg -> rad)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Az_deg * (M_PI / 180.0);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg (constant)
            // Using parameter: phi_L_deg → PARAM_phi_L_deg
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg = PARAM_phi_L_deg;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1 */
            // Units Conversion: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1 (deg -> rad)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg * (M_PI / 180.0);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux (1×7)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_0;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_1;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_2;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[3] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[4] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_cos;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[5] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[6] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_cos;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G
            // Expression: -in(0)[0]*in(0)[5]+in(0)[1]*in(0)[6]*in(0)[3]-in(0)[2]*in(0)[6]*in(0)[4]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G = -model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[0]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[5]+model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[1]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[6]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[3]-model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[2]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[6]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[4];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m
            // Expression: sqrt(pow(in(0)[0],2)+pow(in(0)[1],2)+pow(in(0)[2],2))
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m = sqrt(pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[0],2)+pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[1],2)+pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[2],2));
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa
            // Expression: 6378165.0/in(0)[0]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa = 6378165.0/model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide */
            // Divide block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G) / (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1 */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1 (1×7)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_0;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_1;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_2;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[3] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[4] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_term */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_term
            // Expression: 1.0 + 1.62345E-03*pow(in(0)[5],2)*(1.0-5.0*pow(in(0)[6],2))
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_term = 1.0 + 1.62345E-03*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5],2)*(1.0-5.0*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],2));
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_34 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_34
            // Expression: 0.575E-05*pow(in(0)[5],3)*in(0)[6]*(3-7*pow(in(0)[6],2))+(0.7875E-05/7.0)*pow(in(0)[5],4)*(3.0-42*pow(in(0)[6],2)+63*pow(in(0)[6],4))
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_34 = 0.575E-05*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5],3)*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6]*(3-7*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],2))+(0.7875E-05/7.0)*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5],4)*(3.0-42*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],2)+63*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],4));
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add */
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_34 + model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_term;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant (constant)
            // (constant value initialized in _init)
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_3 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_3
            // Expression: pow(in(0)[0],3)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_3 = pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m,3);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide1 */
            // Divide block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide1
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide1 = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant) / (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_3);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product */
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide1;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product2 */
            // Vector element-wise *
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product2[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[i] * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product);
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_X */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_X
            // Expression: -in(0)[5]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_X = -model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[5];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y
            // Expression: in(0)[6]*in(0)[3]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[6]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[3];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y1 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y1
            // Expression: -in(0)[6]*in(0)[4]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y1 = -model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[6]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[4];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2 */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2 (1×3)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_X;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y1;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1 */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1 (constant)
            // (constant value initialized in _init)
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Math_Function */
            // Square (x^2) block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Math_Function
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Math_Function = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa) * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_2 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_2
            // Expression: pow(in(0)[0],2)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_2 = pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m,2);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12__2J */
            // Scale block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12__2J (gain = 0.0032469)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12__2J = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide * 0.0032469;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_P_34 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_P_34
            // Expression: 0.575E-05*in(0)[5]*(15.0*pow(in(0)[6],2)-3.0) + (0.7875E-05/7.0)*pow(in(0)[5],2)*in(0)[6]*(12.0-28.0*pow(in(0)[6],2))
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_P_34 = 0.575E-05*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5]*(15.0*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],2)-3.0) + (0.7875E-05/7.0)*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[5],2)*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6]*(12.0-28.0*pow(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[6],2));
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add2 */
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12__2J + model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_P_34;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide2 */
            // Product/divide (ops=***/)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide2 = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1) * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Math_Function) * (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add2) / (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_2);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product1 */
            // Vector element-wise *
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product1[i] = (model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide2) * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2[i];
            }
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add1 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add1[i] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product2[i] + model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product1[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product11 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product11
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product11[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product11[i] += model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[i][k] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add1[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product10 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product10
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product10[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product10[i] += model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[i][k] * model->signals.LVDC_Iterative_Guidance_Mode_Product11[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2 */
            // Source block: LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add8 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add8[i] = model->signals.LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2[i] + model->signals.LVDC_Iterative_Guidance_Mode_Product10[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain (gain = 0.5)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain[i] = model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add8[i] * 0.5;
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Product12 */
            // Vector element-wise *
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Product12[i] = (model->signals.LVDC_Iterative_Guidance_Mode_Add) * model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product7 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product7
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product7[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product7[i] += model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[i][k] * model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product9 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product9
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product9[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product9[i] += model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[i][k] * model->signals.LVDC_Iterative_Guidance_Mode_Product7[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps */
            // Source block: LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9[i] = model->signals.LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps[i] - model->signals.LVDC_Iterative_Guidance_Mode_Product9[i] - model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Product12[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Math_Function */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Math_Function
            // Vector element-wise square
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Math_Function[i] = (model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9[i]) * (model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9[i]);
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Sum_of_Elements */
            // Sum of Elements (vector[3] → scalar)
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Sum_of_Elements = 0.0;
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Sum_of_Elements += model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Math_Function[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Divide2 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Divide2
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Divide2 = (model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Sum_of_Elements) / (model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add10 */
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add10 = model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Divide2 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1 = model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add10 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add12 */
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add12 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2 - model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain5 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain5 (gain = 0.00023622791269)
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain5 = model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add12 * 0.00023622791269;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Product13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Product13 = model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain5 * model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product12 */
            // Vector element-wise *
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product12[i] = (model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Product13) * model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add10 */
            // Vector addition with signs (size 3)
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Add10[i] = model->signals.LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9[i] - model->signals.LVDC_Iterative_Guidance_Mode_Product12[i];
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux1 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux1
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux1_0 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux1_1 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux1_2 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[2];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Divide3 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Divide3
            model->signals.LVDC_Iterative_Guidance_Mode_Divide3 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_0) / (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function4 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function4 (atan)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function4 = atan(model->signals.LVDC_Iterative_Guidance_Mode_Divide3);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_const_ */
            // Source block: LVDC_Iterative_Guidance_Mode_const_ (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_N_sec */
            // Source block: LVDC_Iterative_Guidance_Mode_DeltaT_N_sec (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Math_Function
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function = (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_2) * (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function1 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Math_Function1
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function1 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_0) * (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add11 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add11 = model->signals.LVDC_Iterative_Guidance_Mode_Math_Function1 + model->signals.LVDC_Iterative_Guidance_Mode_Math_Function;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function2 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Math_Function2
            // Expression: (in(0)<0?-sqrt(-in(0)):sqrt(in(0)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Math_Function2_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Add11;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function2 = (((_eval_LVDC_Iterative_Guidance_Mode_Math_Function2_in0 < 0)) ? ((-sqrt((-_eval_LVDC_Iterative_Guidance_Mode_Math_Function2_in0)))) : (sqrt(_eval_LVDC_Iterative_Guidance_Mode_Math_Function2_in0)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Divide2 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Divide2
            model->signals.LVDC_Iterative_Guidance_Mode_Divide2 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux1_1) / (model->signals.LVDC_Iterative_Guidance_Mode_Math_Function2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function3 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function3 (atan)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3 = atan(model->signals.LVDC_Iterative_Guidance_Mode_Divide2);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos */
            // Trig block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3);
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11 */
            model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5 + model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain + model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product8 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product8
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product8[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product8[i] += model->signals.LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[i][k] * model->signals.LVDC_Iterative_Guidance_Mode_Product6[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector indices=[1]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector = model->signals.LVDC_Iterative_Guidance_Mode_Product8[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector1 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector1 indices=[1]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector1 = model->signals.LVDC_Iterative_Guidance_Mode_Product9[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add8 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add8 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3 + model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Product13;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add9 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add9 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1 + model->signals.LVDC_Iterative_Guidance_Mode_Add8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product3 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector1 * model->signals.LVDC_Iterative_Guidance_Mode_Add9;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector2 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector2 indices=[1]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector2 = model->signals.LVDC_Iterative_Guidance_Mode_Product10[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function1 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function1
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function1 = (model->signals.LVDC_Iterative_Guidance_Mode_Add9) * (model->signals.LVDC_Iterative_Guidance_Mode_Add9);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product4 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product4 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector2 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain2 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain2 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product4 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos */
            // Trig block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3);
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product13 = model->signals.LVDC_Iterative_Guidance_Mode_Add8 * model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add8 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product13;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product17 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product17 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15 * model->signals.LVDC_Iterative_Guidance_Mode_Add8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product17;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product8 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product8 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_sin;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product3 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain2 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product14 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product14 = model->signals.LVDC_Iterative_Guidance_Mode_Add8 * model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product14 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 * model->signals.LVDC_Iterative_Guidance_Mode_Add8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function1 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function1
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function1 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1) * (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain3 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain3 (gain = 4135.6997)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function1 * 4135.6997;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2 */
            // Scale block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain3 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide3 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product15 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product15 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function5 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function5
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function5 = (model->signals.LVDC_Iterative_Guidance_Mode_Add8) * (model->signals.LVDC_Iterative_Guidance_Mode_Add8);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain5 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain5 (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain5 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function5 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain1 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain5 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add14 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add14 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product15 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add3 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add14 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product1 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product16 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product16 = model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add16 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add16 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product16;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15) / (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add16);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product7 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product7 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add3 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product7;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product5 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product5 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add3 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add2) / (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product5);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product3 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_sin * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_cos + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product5 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product5 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add16;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product6 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product6 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_sin * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product6;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1) * (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product6 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product6 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1 * model->signals.LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide4 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain (gain = 2)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1 * 2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function5 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function5
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function5 = (model->signals.LVDC_Iterative_Guidance_Mode_Add8) * (model->signals.LVDC_Iterative_Guidance_Mode_Add8);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain5 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain5 (gain = 4192.696)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain5 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function5 * 4192.696;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain1 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain5 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add5 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add5 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add4 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add1 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product6;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product19 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product19 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add4 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add4 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product5 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product19;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide */
            // Divide block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product2) / (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add4);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function4);
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function4);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product7 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product7 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product8 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product8 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add6 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add6 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product7 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product18 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product18 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add6 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_sin;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector5 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector5 indices=[0]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector5 = model->signals.LVDC_Iterative_Guidance_Mode_Product10[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function2 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function2
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function2 = (model->signals.LVDC_Iterative_Guidance_Mode_Add9) * (model->signals.LVDC_Iterative_Guidance_Mode_Add9);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product15 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product15 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector5 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain2 */
            // Scale block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain2 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product15 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector4 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector4 indices=[0]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector4 = model->signals.LVDC_Iterative_Guidance_Mode_Product9[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product14 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product14 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector4 * model->signals.LVDC_Iterative_Guidance_Mode_Add9;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector3 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector3 indices=[0]
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector3 = model->signals.LVDC_Iterative_Guidance_Mode_Product8[0];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Constant (constant)
            // Using parameter: R_T_m → PARAM_R_T_m
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Constant = PARAM_R_T_m;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add10 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add10 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector3 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Constant + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product14 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain2 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product18;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product9 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product9 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product11 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product11 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product12 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product12 = model->signals.LVDC_Iterative_Guidance_Mode_Add8 * model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add4;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide5 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide5 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add3 * model->signals.LVDC_Iterative_Guidance_Mode_Demux4_0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial
            // Expression: ((((0)*in(0)+(0)))*in(0)+(0))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial = ((((0 * _eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial_in0) + 0) * _eval_LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial_in0) + 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add5 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add5 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide5 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add14;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial
            // Expression: ((((0)*in(0)+(0)))*in(0)+(0))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Add8;
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial = ((((0 * _eval_LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial_in0) + 0) * _eval_LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial_in0) + 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add2 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product1 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add8 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add8 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add5 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add2 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product11 + model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product12;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product10 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product10 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add7 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add7 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product9 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product10;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product13 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add7;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add9 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add9 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add6 - model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product13;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product16 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product16 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add9 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1 = (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add10) / (model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product16);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product17 */
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product17 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1 * model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground */
            // Source block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant */
            // Condition block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant
            // Evaluate condition: input <= 15
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant = (model->signals.LVDC_Iterative_Guidance_Mode_Add8 <= 15);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch3 */
            // If block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch3
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch3 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground : model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product17;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product13 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch3 * model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_N_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch2 */
            // If block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch2
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch2 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground : model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add13 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add13 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch2 - model->signals.LVDC_Iterative_Guidance_Mode_Product13;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add12 */
                {
                int _term = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? 1 : 0;
                if (!_term) {
                    s_obliq_chi_term_hits = 0;
                    s_obliq_chi_ang_latched = 0;
                }
                if (_term && s_obliq_chi_ang_latched) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Add12 = s_obliq_chi_add12_latched;
                } else {
                    model->signals.LVDC_Iterative_Guidance_Mode_Add12 = model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function4 - model->signals.LVDC_Iterative_Guidance_Mode_Add13 - model->signals.LVDC_Iterative_Guidance_Mode_Add7 - model->signals.LVDC_Iterative_Guidance_Mode_const_;
                    if (_term) s_obliq_chi_add12_latched = model->signals.LVDC_Iterative_Guidance_Mode_Add12;
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SinCos */
            // Trig block: LVDC_Iterative_Guidance_Mode_SinCos (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_SinCos_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Add12);
            model->signals.LVDC_Iterative_Guidance_Mode_SinCos_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Add12);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch1 */
            // If block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch1
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch1 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground : model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product6;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product14 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product14 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch1 * model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_N_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch */
            // If block: LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground : model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add15 */
            model->signals.LVDC_Iterative_Guidance_Mode_Add15 = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch - model->signals.LVDC_Iterative_Guidance_Mode_Product14;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Add14 */
                {
                int _term = model->signals.LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant ? 1 : 0;
                if (_term && s_obliq_chi_ang_latched) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Add14 = s_obliq_chi_add14_latched;
                } else {
                    model->signals.LVDC_Iterative_Guidance_Mode_Add14 = model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3 - model->signals.LVDC_Iterative_Guidance_Mode_Add15;
                    if (_term) {
                        s_obliq_chi_add14_latched = model->signals.LVDC_Iterative_Guidance_Mode_Add14;
                        s_obliq_chi_term_hits++;
                        if (s_obliq_chi_term_hits >= 2) s_obliq_chi_ang_latched = 1;
                    }
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SinCos1 */
            // Trig block: LVDC_Iterative_Guidance_Mode_SinCos1 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_SinCos1_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_Add14);
            model->signals.LVDC_Iterative_Guidance_Mode_SinCos1_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_Add14);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product16 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product16 = model->signals.LVDC_Iterative_Guidance_Mode_SinCos_cos * model->signals.LVDC_Iterative_Guidance_Mode_SinCos1_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product17 */
            model->signals.LVDC_Iterative_Guidance_Mode_Product17 = model->signals.LVDC_Iterative_Guidance_Mode_SinCos_sin * model->signals.LVDC_Iterative_Guidance_Mode_SinCos1_cos;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Unary_Minus1 */
            // Unary minus block: LVDC_Iterative_Guidance_Mode_Unary_Minus1
            model->signals.LVDC_Iterative_Guidance_Mode_Unary_Minus1 = -model->signals.LVDC_Iterative_Guidance_Mode_Product17;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Mux */
            // Mux block: LVDC_Iterative_Guidance_Mode_Mux (1×3)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_Mux[0] = model->signals.LVDC_Iterative_Guidance_Mode_Product16;
            model->signals.LVDC_Iterative_Guidance_Mode_Mux[1] = model->signals.LVDC_Iterative_Guidance_Mode_SinCos1_sin;
            model->signals.LVDC_Iterative_Guidance_Mode_Mux[2] = model->signals.LVDC_Iterative_Guidance_Mode_Unary_Minus1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function5 */
            // Transpose block: LVDC_Iterative_Guidance_Mode_Math_Function5
            // Matrix transpose: [3][3] -> [3][3]
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Math_Function5[j][i] = model->signals.LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[i][j];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Product15 */
            // Matrix multiply block: LVDC_Iterative_Guidance_Mode_Product15
            // Matrix-vector multiplication: [3x3] × [3] = [3]
            for (int i = 0; i < 3; i++) {
                model->signals.LVDC_Iterative_Guidance_Mode_Product15[i] = 0.0;
                for (int k = 0; k < 3; k++) {
                    model->signals.LVDC_Iterative_Guidance_Mode_Product15[i] += model->signals.LVDC_Iterative_Guidance_Mode_Math_Function5[i][k] * model->signals.LVDC_Iterative_Guidance_Mode_Mux[k];
                }
            }
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux2 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux2
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux2_0 = model->signals.LVDC_Iterative_Guidance_Mode_Product15[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux2_1 = model->signals.LVDC_Iterative_Guidance_Mode_Product15[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux2_2 = model->signals.LVDC_Iterative_Guidance_Mode_Product15[2];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Constant7 */
            // Source block: LVDC_Iterative_Guidance_Mode_Constant7 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function6 */
            // Square (x^2) block: LVDC_Iterative_Guidance_Mode_Math_Function6
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function6 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux2_1) * (model->signals.LVDC_Iterative_Guidance_Mode_Demux2_1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Subtract */
            model->signals.LVDC_Iterative_Guidance_Mode_Subtract = model->signals.LVDC_Iterative_Guidance_Mode_Constant7 - model->signals.LVDC_Iterative_Guidance_Mode_Math_Function6;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Math_Function7 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Math_Function7
            // Expression: (in(0)<0?-sqrt(-in(0)):sqrt(in(0)))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Math_Function7_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Subtract;
            // Note: This expression requires #include <math.h>
            model->signals.LVDC_Iterative_Guidance_Mode_Math_Function7 = (((_eval_LVDC_Iterative_Guidance_Mode_Math_Function7_in0 < 0)) ? ((-sqrt((-_eval_LVDC_Iterative_Guidance_Mode_Math_Function7_in0)))) : (sqrt(_eval_LVDC_Iterative_Guidance_Mode_Math_Function7_in0)));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Divide4 */
            // Divide block: LVDC_Iterative_Guidance_Mode_Divide4
            model->signals.LVDC_Iterative_Guidance_Mode_Divide4 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux2_1) / (model->signals.LVDC_Iterative_Guidance_Mode_Math_Function7);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function2 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function2 (atan)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function2 = atan(model->signals.LVDC_Iterative_Guidance_Mode_Divide4);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Read3 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_Data_Store_Read3 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad
            model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read3 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Sum */
            model->signals.LVDC_Iterative_Guidance_Mode_Sum = model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function2 + model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion2 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion2 (rad -> deg)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion2 = model->signals.LVDC_Iterative_Guidance_Mode_Sum * (180.0 / M_PI);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode__45_degree_limit */
            // Limit block: LVDC_Iterative_Guidance_Mode__45_degree_limit (lower = -45, upper = 45)
            model->signals.LVDC_Iterative_Guidance_Mode__45_degree_limit = fmax(-45, fmin(45, model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion2));
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Unary_Minus */
            // Unary minus block: LVDC_Iterative_Guidance_Mode_Unary_Minus
            model->signals.LVDC_Iterative_Guidance_Mode_Unary_Minus = -model->signals.LVDC_Iterative_Guidance_Mode_Demux2_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Trigonometric_Function5 */
            // Trig block: LVDC_Iterative_Guidance_Mode_Trigonometric_Function5 (atan2)
            model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function5 = atan2(model->signals.LVDC_Iterative_Guidance_Mode_Unary_Minus, model->signals.LVDC_Iterative_Guidance_Mode_Demux2_0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Read */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad
            model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Sum1 */
            model->signals.LVDC_Iterative_Guidance_Mode_Sum1 = model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function5 + model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion1 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion1 (rad -> deg)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion1 = model->signals.LVDC_Iterative_Guidance_Mode_Sum1 * (180.0 / M_PI);
    }

    /* LVDC_Iterative_Guidance_Mode_loop */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_loop (output phase)
    for (int i = 0; i < 3; i++) {
        model->signals.LVDC_Iterative_Guidance_Mode_loop[i] = model->states.LVDC_Iterative_Guidance_Mode_loop_state[i];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Selector1 */
            // Selector block: LVDC_Iterative_Guidance_Mode_Selector1 indices=[1,2]
            model->signals.LVDC_Iterative_Guidance_Mode_Selector1[0] = model->signals.LVDC_Iterative_Guidance_Mode_loop[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Selector1[1] = model->signals.LVDC_Iterative_Guidance_Mode_loop[2];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion3 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion3 (deg -> rad)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion3[0] = model->signals.LVDC_Iterative_Guidance_Mode_Selector1[0] * (M_PI / 180.0);
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion3[1] = model->signals.LVDC_Iterative_Guidance_Mode_Selector1[1] * (M_PI / 180.0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion5 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion5 (rad -> deg)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion5 = model->signals.LVDC_Iterative_Guidance_Mode_Add14 * (180.0 / M_PI);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Angle_Conversion6 */
            // Units Conversion: LVDC_Iterative_Guidance_Mode_Angle_Conversion6 (rad -> deg)
            model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion6 = model->signals.LVDC_Iterative_Guidance_Mode_Trigonometric_Function3 * (180.0 / M_PI);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Compare_To_Constant */
            // Condition block: LVDC_Iterative_Guidance_Mode_Compare_To_Constant
            // Evaluate condition: input >= 58.5
            model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant = (model->signals.T3_Timer_Switch >= 58.5);
    }

    /* LVDC_Iterative_Guidance_Mode_Compare_To_Constant2 */
    // Condition block: LVDC_Iterative_Guidance_Mode_Compare_To_Constant2
    // Evaluate condition: input < 14.4
    model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant2 = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3 < 14.4);
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive
            model->signals.LVDC_Iterative_Guidance_Mode_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive;
    }

    /* LVDC_Iterative_Guidance_Mode_Compare_To_Constant3 */
    // Condition block: LVDC_Iterative_Guidance_Mode_Compare_To_Constant3
    // Evaluate condition: input != 0
    model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant3 = (model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive != 0);
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Logical_Operator1 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Logical_Operator1
            // Expression: !(in(0))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Logical_Operator1_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant3;
            model->signals.LVDC_Iterative_Guidance_Mode_Logical_Operator1 = (!_eval_LVDC_Iterative_Guidance_Mode_Logical_Operator1_in0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Logical_Operator */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_Logical_Operator
            // Expression: (in(0))&&(in(1))
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_Logical_Operator_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Logical_Operator1;
            double _eval_LVDC_Iterative_Guidance_Mode_Logical_Operator_in1 = model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant;
            model->signals.LVDC_Iterative_Guidance_Mode_Logical_Operator = (_eval_LVDC_Iterative_Guidance_Mode_Logical_Operator_in0 && _eval_LVDC_Iterative_Guidance_Mode_Logical_Operator_in1);
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY_enable_bool */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_SMCY_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_SMCY_enable_bool_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Logical_Operator;
    model->signals.LVDC_Iterative_Guidance_Mode_SMCY_enable_bool = (_eval_LVDC_Iterative_Guidance_Mode_SMCY_enable_bool_in0 != 0);

    /* LVDC_Iterative_Guidance_Mode_SMCY_SMCY */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCY_SMCY (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCY_SMCY = model->states.LVDC_Iterative_Guidance_Mode_SMCY_SMCY_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Constant9 */
            // Source block: LVDC_Iterative_Guidance_Mode_SMCY_Constant9 (constant)
            // (constant value initialized in _init)
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last = model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last_state;

    /* LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2 */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2 (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2 = model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Sum5 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Sum5 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2 + model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Gain1 */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCY_Gain1 (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Gain1 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Sum5 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Add20 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add20 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Gain1 - model->signals.LVDC_Iterative_Guidance_Mode_SMCY_SMCY;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6 */
            // Trig block: LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6 (tan)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6 = tan(model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add20);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux3 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux3
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux3_0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux3_1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux3_2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[2];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Product18 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Product18 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6 * model->signals.LVDC_Iterative_Guidance_Mode_Demux3_0;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Add19 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add19 = model->signals.LVDC_Iterative_Guidance_Mode_Demux3_2 + model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Product18;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Product19 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Product19 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6 * model->signals.LVDC_Iterative_Guidance_Mode_Demux3_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Add17 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add17 = model->signals.LVDC_Iterative_Guidance_Mode_Demux3_0 - model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Product19;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Divide6 */
            // Product/divide (ops=**/)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Divide6 = (model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Constant9) * (model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add19) / (model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Add17);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_SMCG_Y_Axis */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCY_SMCG_Y_Axis (gain = 0.03)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_SMCG_Y_Axis = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Divide6 * 0.03;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_Sum2 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Sum2 = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_SMCG_Y_Axis + model->signals.LVDC_Iterative_Guidance_Mode_SMCY_SMCY;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCY_pirads_to_radians */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCY_pirads_to_radians (gain = 3.141592653589793)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCY_pirads_to_radians = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Sum2 * 3.141592653589793;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_pirads_to_radians;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool_in0 = model->signals.LVDC_Iterative_Guidance_Mode_Logical_Operator;
    model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool = (_eval_LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool_in0 != 0);

    /* LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ = model->states.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Constant8 */
            // Source block: LVDC_Iterative_Guidance_Mode_SMCZ_Constant8 (constant)
            // (constant value initialized in _init)
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2 */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2 (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2 = model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2_state;

    /* LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last */
    // Unit Delay block: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last (output phase)
    model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last = model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last_state;
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Sum4 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Sum4 = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2 + model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Gain */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCZ_Gain (gain = 0.5)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Gain = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Sum4 * 0.5;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Add16 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Add16 = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Gain - model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2 */
            // Trig block: LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2 (sincos)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_sin = sin(model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Add16);
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_cos = cos(model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Add16);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8 */
            // Evaluate block: LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8
            // Expression: 1.0/in(0)
            // Input variables
            double _eval_LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8_in0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3;
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8 = (1.0 / _eval_LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8_in0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Divide7 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Divide7 = model->signals.LVDC_Iterative_Guidance_Mode_Demux3_1 * model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Add18 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Add18 = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_sin - model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Divide7;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Divide5 */
            // Product/divide (ops=**/)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Divide5 = (model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Constant8) * (model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Add18) / (model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_cos);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_SMCG */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCZ_SMCG (gain = 0.03)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SMCG = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Divide5 * 0.03;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_Sum3 */
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Sum3 = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SMCG + model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_SMCZ_pirads_to_radians */
            // Scale block: LVDC_Iterative_Guidance_Mode_SMCZ_pirads_to_radians (gain = 3.141592653589793)
            model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_pirads_to_radians = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Sum3 * 3.141592653589793;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Write1 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_Data_Store_Write1 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_pirads_to_radians;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Data_Store_Write2 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_Data_Store_Write2 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_Add8;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant1 (constant)
            // Using parameter: DeltaV_b_mps → PARAM_DeltaV_b_mps
            model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant1 = PARAM_DeltaV_b_mps;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_b_Sum */
            model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Sum = model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3 - model->signals.LVDC_Iterative_Guidance_Mode_Memory1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_b_Divide */
            // Product/divide (ops=**/)
            model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Divide = (model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant1) * (model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant) / (model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Sum);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_DeltaT_b_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_DeltaT_b_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec = model->signals.LVDC_Iterative_Guidance_Mode_DeltaT_b_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Demux5 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Demux5
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Demux5_0 = model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion3[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Demux5_1 = model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion3[1];
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant */
            // Source block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read1 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read1 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read1 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant1 */
            // Condition block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant1
            // Evaluate condition: input == 1
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant1 = (model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read1 == 1);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read2 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read2 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read2 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground */
            // Source block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Switch */
            // If block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Switch
            // If control is true/nonzero, output = input2, else output = input1
            // Switch criteria: u2 ~= 0 (threshold=0)
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Switch = model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant1 ? model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read2 : model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Sum */
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Sum = model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read - model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant - model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Switch;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant */
            // Condition block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant
            // Evaluate condition: input <= 0.04
            model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant = (model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Sum <= 0.04);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Sum;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled && (model->sample_tick % (unsigned long long)llround((0.04) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Write1 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Write1 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive = model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1;
    }

    /* LVDC_Iterative_Guidance_Mode_epsilon_prime */
    // Condition block: LVDC_Iterative_Guidance_Mode_epsilon_prime
    // Evaluate condition: input > 5
    model->signals.LVDC_Iterative_Guidance_Mode_epsilon_prime = (model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3 > 5);
    /* Same-step enable refresh from LVDC_Iterative_Guidance_Mode_epsilon_prime */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled = 0;
    } else {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_epsilon_prime) ? 1 : 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_Data_Store_Write3 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_Data_Store_Write3 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg = model->signals.LVDC_Iterative_Guidance_Mode_Angle_Conversion1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_Data_Store_Write4 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_Data_Store_Write4 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg = model->signals.LVDC_Iterative_Guidance_Mode__45_degree_limit;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Constant1 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Constant1 = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Sum4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Sum4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read - model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Constant1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Write1 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Write1 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Sum4;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2
    // Expression: in(0) <= 1.6
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec;
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2 = (_eval_LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2_in0 <= 1.6);
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode = model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read5 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read5 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read5 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Write2 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Write2 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_T_HSL */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_T_HSL (constant)
            // Using parameter: T_HSL_sec → PARAM_T_HSL_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_T_HSL = PARAM_T_HSL_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Sum */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Sum = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_T_HSL + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read5;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1
    // Expression: in(0) <= in(1)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1_in0 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2;
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Sum;
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1 = (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1_in0 <= _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1_in1);
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read5 */
            // Data Store Read: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read5 ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read5 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Write1 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Write1 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Subtract3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Write5 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Write5 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_epsilon_2_from_EDD */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_epsilon_2_from_EDD (constant)
            // Using parameter: epsilon_2_sec → PARAM_epsilon_2_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_epsilon_2_from_EDD = PARAM_epsilon_2_sec;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1
    // Expression: in(0) <= in(1)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_epsilon_2_from_EDD;
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1 = (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1_in0 <= _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1_in1);
    /* Same-step enable refresh from LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1 */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled = 0;
    } else {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1) ? 1 : 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_T_HSL_sec */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_T_HSL_sec (constant)
            // Using parameter: T_HSL_sec → PARAM_T_HSL_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_T_HSL_sec = PARAM_T_HSL_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Sum */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Sum = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_T_HSL_sec + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read5;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2
    // Expression: in(0) <= in(1)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec;
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Sum;
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2 = (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2_in0 <= _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2_in1);
    /* Same-step enable refresh from LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2 */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled = 0;
    } else {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2) ? 1 : 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_Data_Store_Write_nHSLActive */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_Data_Store_Write_nHSLActive → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nTerminalSteeringMode
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nTerminalSteeringMode = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1 = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write2 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write2 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write3 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write3 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write4 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write4 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write5 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write5 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write6 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Write6 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract4 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract4 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6 - model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2
    // Expression: in(0) >= in(1)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec;
    double _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2_in1 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract4;
    model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2 = (_eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2_in0 >= _eval_LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2_in1);
    /* Same-step enable refresh from LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2 */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled = 0;
    } else {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2) ? 1 : 0);
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant1 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant1 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant1 = PARAM_delta_T_sec;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2 */
            // Source block: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2 (constant)
            // (constant value initialized in _init)
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write2 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write2 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write3 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write3 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write4 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write4 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract3 */
            model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract3 = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1 + model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write5 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write5 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write6 */
            // Data Store Write: LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Write6 → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec = model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract1;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Mux1 */
            // Mux block: LVDC_Iterative_Guidance_Mode_Mux1 (1×3)
            // Vector output
            model->signals.LVDC_Iterative_Guidance_Mode_Mux1[0] = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_1;
            model->signals.LVDC_Iterative_Guidance_Mode_Mux1[1] = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_2;
            model->signals.LVDC_Iterative_Guidance_Mode_Mux1[2] = model->signals.LVDC_Iterative_Guidance_Mode_Demux4_3;
    }
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5 */
            // Demux block: LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5
            // Demux vector input
            model->signals.LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_0 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[0];
            model->signals.LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_1 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[1];
            model->signals.LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_2 = model->signals.LVDC_Iterative_Guidance_Mode_Add10[2];
    }

    /* LVDC_Iterative_Guidance_Mode_Switch_Case_case_0 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_Switch_Case_case_0
    // Expression: in(0)==(0)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_0_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_0 = (_eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_0_in0 == 0);

    /* LVDC_Iterative_Guidance_Mode_Switch_Case_case_1 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_Switch_Case_case_1
    // Expression: in(0)==(1)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_1_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_1 = (_eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_1_in0 == 1);

    /* LVDC_Iterative_Guidance_Mode_Switch_Case_case_2 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_Switch_Case_case_2
    // Expression: in(0)==(2)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_2_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_2 = (_eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_2_in0 == 2);

    /* LVDC_Iterative_Guidance_Mode_Switch_Case_case_3 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_Switch_Case_case_3
    // Expression: in(0)==(3)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_3_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_3 = (_eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_3_in0 == 3);

    /* LVDC_Iterative_Guidance_Mode_Switch_Case_case_4 */
    // Evaluate block: LVDC_Iterative_Guidance_Mode_Switch_Case_case_4
    // Expression: in(0)==(4)
    // Input variables
    double _eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_4_in0 = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode;
    model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_4 = (_eval_LVDC_Iterative_Guidance_Mode_Switch_Case_case_4_in0 == 4);
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Constant4 */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Constant4 (constant)
            // Using parameter: delta_T_sec → PARAM_delta_T_sec
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Constant4 = PARAM_delta_T_sec;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Constant5 */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_Constant5 (constant)
            // (constant value initialized in _init)
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1 */
            // Units Conversion: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1 (deg -> rad)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg * (M_PI / 180.0);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_phi_L_prime_deg */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_phi_L_prime_deg (constant)
            // Using parameter: phi_L_prime_deg → PARAM_phi_L_prime_deg
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_phi_L_prime_deg = PARAM_phi_L_prime_deg;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2 */
            // Units Conversion: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2 (deg -> rad)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_phi_L_prime_deg * (M_PI / 180.0);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Add */
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Add = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1 - model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion */
            // Units Conversion: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion (deg -> rad)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Az_deg * (M_PI / 180.0);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Add);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Add);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4 */
            // Trig block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4 (sincos)
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_sin = sin(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2);
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_cos = cos(model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2);
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_R_L */
            // Source block: LVDC_S_Frame_Position_Velocity_Calculations_R_L (constant)
            // Using parameter: R_L_m → PARAM_R_L_m
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_R_L = PARAM_R_L_m;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux (1×9)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_R_L;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_cos;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[3] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[4] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_cos;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[5] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[6] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_cos;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[7] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_sin;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[8] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_cos;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn
            // Expression: in(0)[0]*in(0)[6]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[6];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn1 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn1
            // Expression: in(0)[0]*in(0)[5]*in(0)[1]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn1 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[5]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[1];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn2 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn2
            // Expression: -in(0)[0]*in(0)[5]*in(0)[2]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn2 = -model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[5]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[2];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3
            // Expression: 0.0
            // Input variables
            double _eval_LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3_in0 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]; // vector→scalar head
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3 = 0.0;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn4 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn4
            // Expression: in(0)[0]*0.000023211523*M_PI*in(0)[8]*in(0)[2]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn4 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]*0.000023211523*M_PI*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[8]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[2];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn5 */
            // Evaluate block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn5
            // Expression: in(0)[0]*0.000023211523*M_PI*in(0)[8]*in(0)[1]
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn5 = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[0]*0.000023211523*M_PI*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[8]*model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[1];
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1 */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1 (1×3)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn1;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn2;
    }
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {

            /* LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2 */
            // Mux block: LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2 (1×3)
            // Vector output
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2[0] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2[1] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn4;
            model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2[2] = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn5;
    }

    /* Logical_Operator */
    // Evaluate block: Logical_Operator
    // Expression: !(in(0))
    // Input variables
    double _eval_Logical_Operator_in0 = model->signals.Stage_Sep_3;
    model->signals.Logical_Operator = (!_eval_Logical_Operator_in0);

    /* Logical_Operator1 */
    // Evaluate block: Logical_Operator1
    // Expression: (in(0))&&(in(1))
    // Input variables
    double _eval_Logical_Operator1_in0 = model->signals.Compare_To_Zero;
    double _eval_Logical_Operator1_in1 = model->signals.Logical_Operator;
    model->signals.Logical_Operator1 = (_eval_Logical_Operator1_in0 && _eval_Logical_Operator1_in1);

    /* Logical_Operator4 */
    // Evaluate block: Logical_Operator4
    // Expression: (in(0))&&(in(1))
    // Input variables
    double _eval_Logical_Operator4_in0 = model->signals.Memory;
    double _eval_Logical_Operator4_in1 = model->signals.Cutoff_Enable;
    model->signals.Logical_Operator4 = (_eval_Logical_Operator4_in0 && _eval_Logical_Operator4_in1);

    /* Logical_Operator6 */
    // Evaluate block: Logical_Operator6
    // Expression: !(in(0))
    // Input variables
    double _eval_Logical_Operator6_in0 = model->signals.Logical_Operator4;
    model->signals.Logical_Operator6 = (!_eval_Logical_Operator6_in0);

    /* Logical_Operator5 */
    // Evaluate block: Logical_Operator5
    // Expression: (in(0))&&(in(1))
    // Input variables
    double _eval_Logical_Operator5_in0 = model->signals.Stage_Sep_3;
    double _eval_Logical_Operator5_in1 = model->signals.Logical_Operator6;
    model->signals.Logical_Operator5 = (_eval_Logical_Operator5_in0 && _eval_Logical_Operator5_in1);

    /* OECO_2 */
    // Condition block: OECO_2
    // Evaluate condition: input >= 6.2
    model->signals.OECO_2 = (model->signals.T2_Timer_Switch >= 6.2);

    /* OECO_2_141_5 */
    // Condition block: OECO_2_141_5
    // Evaluate condition: input >= 147.2
    model->signals.OECO_2_141_5 = (model->signals.T2_Timer_Switch >= 147.2);

    /* T4_Timer_Clock */
    // Clock block: T4_Timer_Clock
    model->signals.T4_Timer_Clock = model->time;

    /* T4_Timer_Data_Store_Read */
    // Data Store Read: T4_Timer_Data_Store_Read ← data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A
    model->signals.T4_Timer_Data_Store_Read = model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A;

    /* T4_Timer_Sum */
    model->signals.T4_Timer_Sum = model->signals.T4_Timer_Clock - model->signals.T4_Timer_Data_Store_Read;

    /* T4_Timer_Constant */
    // Source block: T4_Timer_Constant (constant)
    // (constant value initialized in _init)

    /* T4_Timer_Switch */
    // If block: T4_Timer_Switch
    // If control is true/nonzero, output = input2, else output = input1
    // Switch criteria: u2 >= Threshold (threshold=0)
    model->signals.T4_Timer_Switch = ((model->signals.T4_Timer_Data_Store_Read) >= (0)) ? model->signals.T4_Timer_Sum : model->signals.T4_Timer_Constant;

    /* Orbit_Mode */
    // Condition block: Orbit_Mode
    // Evaluate condition: input >= 15.0
    model->signals.Orbit_Mode = (model->signals.T4_Timer_Switch >= 15.0);

    /* T1_Timer_Timer_Initialization_enable_bool */
    // Evaluate block: T1_Timer_Timer_Initialization_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_T1_Timer_Timer_Initialization_enable_bool_in0 = model->inputs.bLiftoff;
    model->signals.T1_Timer_Timer_Initialization_enable_bool = (_eval_T1_Timer_Timer_Initialization_enable_bool_in0 != 0);
    if (model->enable_states.T1_Timer_Timer_Initialization_enabled) {

            /* T1_Timer_Timer_Initialization_Data_Store_Write */
            // Data Store Write: T1_Timer_Timer_Initialization_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A = model->signals.T1_Timer_Clock;
    }

    /* T2_Timer_Timer_Initialization_enable_bool */
    // Evaluate block: T2_Timer_Timer_Initialization_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_T2_Timer_Timer_Initialization_enable_bool_in0 = model->inputs.bSIBPropellantSensorDry;
    model->signals.T2_Timer_Timer_Initialization_enable_bool = (_eval_T2_Timer_Timer_Initialization_enable_bool_in0 != 0);
    if (model->enable_states.T2_Timer_Timer_Initialization_enabled) {

            /* T2_Timer_Timer_Initialization_Data_Store_Write */
            // Data Store Write: T2_Timer_Timer_Initialization_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A = model->signals.T2_Timer_Clock;
    }

    /* T3_Timer_Timer_Initialization_enable_bool */
    // Evaluate block: T3_Timer_Timer_Initialization_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_T3_Timer_Timer_Initialization_enable_bool_in0 = model->signals.OECO_2;
    model->signals.T3_Timer_Timer_Initialization_enable_bool = (_eval_T3_Timer_Timer_Initialization_enable_bool_in0 != 0);
    if (model->enable_states.T3_Timer_Timer_Initialization_enabled) {

            /* T3_Timer_Timer_Initialization_Data_Store_Write */
            // Data Store Write: T3_Timer_Timer_Initialization_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A = model->signals.T3_Timer_Clock;
    }

    /* T4_Timer_Timer_Initialization_enable_bool */
    // Evaluate block: T4_Timer_Timer_Initialization_enable_bool
    // Expression: in(0)!=0
    // Input variables
    double _eval_T4_Timer_Timer_Initialization_enable_bool_in0 = model->signals.Logical_Operator4;
    model->signals.T4_Timer_Timer_Initialization_enable_bool = (_eval_T4_Timer_Timer_Initialization_enable_bool_in0 != 0);
    if (model->enable_states.T4_Timer_Timer_Initialization_enabled) {

            /* T4_Timer_Timer_Initialization_Data_Store_Write */
            // Data Store Write: T4_Timer_Timer_Initialization_Data_Store_Write → data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A
            model->data_stores.Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A = model->signals.T4_Timer_Clock;
    }

    /* Ullage_Ignition_3 */
    // Condition block: Ullage_Ignition_3
    // Evaluate condition: input >= 1.1
    model->signals.Ullage_Ignition_3 = (model->signals.T3_Timer_Switch >= 1.1);

    /* Deferred discrete state updates (unit_delay / Memory) */

    /* LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2 state update */
    // Unit Delay state update: LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2
    for (int i = 0; i < 3; i++) {
        model->states.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[i];
    }

    /* Memory state update */
    // Unit Delay state update: Memory
    model->states.Memory_state = model->signals.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant;

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4
    if (model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4_state = model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3;
    }

    /* LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2 state update */
    // Unit Delay state update: LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2
    if ((model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        for (int i = 0; i < 3; i++) {
            model->states.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[i] = model->inputs.V_m_bar_mps[i];
        }
    }

    /* LVDC_Iterative_Guidance_Mode_Memory1 state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_Memory1
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_Memory1_state = model->signals.LVDC_Iterative_Guidance_Mode_Math_Function3;
    }

    /* LVDC_Iterative_Guidance_Mode_Memory2 state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_Memory2
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_Memory2_state = model->signals.LVDC_Iterative_Guidance_Mode_Memory1;
    }

    /* LVDC_Iterative_Guidance_Mode_loop state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_loop
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        for (int i = 0; i < 3; i++) {
            model->states.LVDC_Iterative_Guidance_Mode_loop_state[i] = model->signals.LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[i];
        }
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY_SMCY state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCY_SMCY
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCY_SMCY_state = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Sum2;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last_state = model->signals.LVDC_Iterative_Guidance_Mode_Demux5_0;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2 state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2_state = model->signals.LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ_state = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Sum3;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2 state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2_state = model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last;
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last state update */
    // Unit Delay state update: LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last
    if (model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled && (model->sample_tick % (unsigned long long)llround((1.6) / model->dt) == 0ULL)) {
        model->states.LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last_state = model->signals.LVDC_Iterative_Guidance_Mode_Demux5_1;
    }

    /* Copy signals to outputs */
    memcpy(&model->outputs.R_S_bar_m, &model->signals.LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18, sizeof(model->outputs.R_S_bar_m));
    memcpy(&model->outputs.Psi_deg, &model->signals.D_A_Converter_Quantization, sizeof(model->outputs.Psi_deg));
    model->outputs.bSIVEngineStart = model->signals.J_2_Engine_Start_3;
    model->outputs.bSIVCutoff = model->signals.Memory;
    model->outputs.bIECO = model->signals.IECO_2;
    model->outputs.bSimulinkSIVBEnable = model->signals.Stage_Sep_3;
    model->outputs.bOECO = model->signals.OECO_2;
    model->outputs.bUllageMotorStart = model->signals.Ullage_Ignition_3;
    model->outputs.bSIVBurn = model->signals.Logical_Operator5;
    model->outputs.bSIVCoast = model->signals.Logical_Operator1;
    model->outputs.bSwitchpoin5 = model->signals.OECO_2_141_5;
    model->outputs.bSIBStageSep = model->signals.Stage_Sep_3;
    model->outputs.T1_sec = model->signals.T1_Timer_Switch;
    memcpy(&model->outputs.theta_deg, &model->inputs.Theta_deg, sizeof(model->outputs.theta_deg));

    LVDA_LVDC_evaluate_enable_states(model);
}

/*
 * Evaluate enable states for all subsystems
 * Called at the end of each time step
 * 
 * Enable inheritance rules:
 * 1. If parent is disabled, children are disabled
 * 2. If parent is enabled, children check their own enable
 * 3. Root level is always enabled
 * 
 * When disabled:
 * - Algebraic evaluation inside the subsystem is skipped (signals hold)
 * - State integration is skipped
 * - Outputs use last computed values
 * - States remain frozen
 * 
 * On becoming enabled (0→1): set IcNeedsLoading on showInitPort integrators
 */
/* Update enable states based on enable inputs and parent states */
void LVDA_LVDC_evaluate_enable_states(LVDA_LVDC_t* model) {

    /* Evaluate enable/trigger for LVDC_Iterative_Guidance_Mode */
    /* Level enable */
    model->enable_states.LVDC_Iterative_Guidance_Mode_enabled = ((model->signals.Logical_Operator2) ? 1 : 0);

    /* Evaluate enable/trigger for LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles */
    /* Level enable */
    model->enable_states.LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled = ((model->signals.LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2) ? 1 : 0);

    /* LVDC_Iterative_Guidance_Mode_DeltaT_b inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant2) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Compare_To_Constant3) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_epsilon_prime) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_0) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_4) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_3) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_2) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_Switch_Case_case_1) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_SMCY inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_SMCY_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_SMCY_enable_bool) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_SMCZ inherits from parent LVDC_Iterative_Guidance_Mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_SMCZ_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool) ? 1 : 0);
    }

    /* Evaluate enable/trigger for LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11 */
    /* Level enable */
    model->enable_states.LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled = ((model->signals.LVDC_S_Frame_Position_Velocity_Calculations_T3_FM) ? 1 : 0);

    /* Evaluate enable/trigger for T1_Timer_Timer_Initialization */
    /* Rising-edge trigger (Simulink TriggerPort) */
    {
        int _trig = ((model->signals.T1_Timer_Timer_Initialization_enable_bool) ? 1 : 0);
        model->enable_states.T1_Timer_Timer_Initialization_enabled = (_trig && !model->enable_states.T1_Timer_Timer_Initialization_trig_prev) ? 1 : 0;
        model->enable_states.T1_Timer_Timer_Initialization_trig_prev = _trig;
    }

    /* Evaluate enable/trigger for T2_Timer_Timer_Initialization */
    /* Rising-edge trigger (Simulink TriggerPort) */
    {
        int _trig = ((model->signals.T2_Timer_Timer_Initialization_enable_bool) ? 1 : 0);
        model->enable_states.T2_Timer_Timer_Initialization_enabled = (_trig && !model->enable_states.T2_Timer_Timer_Initialization_trig_prev) ? 1 : 0;
        model->enable_states.T2_Timer_Timer_Initialization_trig_prev = _trig;
    }

    /* Evaluate enable/trigger for T3_Timer_Timer_Initialization */
    /* Rising-edge trigger (Simulink TriggerPort) */
    {
        int _trig = ((model->signals.T3_Timer_Timer_Initialization_enable_bool) ? 1 : 0);
        model->enable_states.T3_Timer_Timer_Initialization_enabled = (_trig && !model->enable_states.T3_Timer_Timer_Initialization_trig_prev) ? 1 : 0;
        model->enable_states.T3_Timer_Timer_Initialization_trig_prev = _trig;
    }

    /* Evaluate enable/trigger for T4_Timer_Timer_Initialization */
    /* Rising-edge trigger (Simulink TriggerPort) */
    {
        int _trig = ((model->signals.T4_Timer_Timer_Initialization_enable_bool) ? 1 : 0);
        model->enable_states.T4_Timer_Timer_Initialization_enabled = (_trig && !model->enable_states.T4_Timer_Timer_Initialization_trig_prev) ? 1 : 0;
        model->enable_states.T4_Timer_Timer_Initialization_trig_prev = _trig;
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1 inherits from parent LVDC_Iterative_Guidance_Mode_IGM_First_Phase */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode inherits from parent LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode inherits from parent LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode inherits from parent LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1) ? 1 : 0);
    }

    /* LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3 inherits from parent LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode */
    if (!model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled) {
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled = 0;
    } else {
        /* Level enable */
        model->enable_states.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled = ((model->signals.LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2) ? 1 : 0);
    }
}

