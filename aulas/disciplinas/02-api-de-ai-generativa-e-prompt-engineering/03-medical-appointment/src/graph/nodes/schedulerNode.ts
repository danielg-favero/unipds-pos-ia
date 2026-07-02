import { z } from "zod/v3";

import type { GraphState } from "../graph.ts";
import { AppointmentService } from "../../services/appointmentService.ts";

const ScheduleRequiredFieldsSchema = z.object({
  professionalId: z.number({ required_error: "Professional ID is required" }),
  datetime: z.string({ required_error: "Appointment datetime is required" }),
  patientName: z.string({ required_error: "Patient name is required" }),
});

export function createSchedulerNode(appointmentService: AppointmentService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`📅 Scheduling appointment...`);

    try {
      const validation = ScheduleRequiredFieldsSchema.safeParse(state);

      if (!validation.success) {
        const errorMessages = validation.error.errors
          .map((error) => error.message)
          .join(", ");

        return {
          actionSuccess: false,
          actionError: errorMessages,
        };
      }

      const appointment = appointmentService.bookAppointment(
        validation.data.professionalId,
        new Date(validation.data.datetime),
        validation.data.patientName,
        state.reason ?? "general consultation",
      );

      console.log(`✅ Appointment scheduled successfully`);

      return {
        appointmentData: appointment,
        actionSuccess: true,
      };
    } catch (error) {
      console.log(
        `❌ Scheduling failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        actionSuccess: false,
        actionError:
          error instanceof Error ? error.message : "Scheduling failed",
      };
    }
  };
}
